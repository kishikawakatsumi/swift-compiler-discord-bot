'use strict';

const { Client, MessageAttachment, Util } = require('discord.js');
const client = new Client();
const config = require("./config.json");

const availableVersions = ['2018-04-18-a',
                           '4.1',
                           '4.0.3',
                           '4.0.2',
                           '4.0',
                           '3.1.1',
                           '3.1',
                           '3.0.2',
                           '3.0.1'];
const latestVersion = availableVersions[0];
const stableVersion = '4.1';
const maxLength = 1950;

const resultMessages = {}

client.on("ready", () => {
  console.log("Swift compiler bot is ready!");
});

client.on("message", (message) => {
  processMessage(message)
});

client.on("messageUpdate", (oldMessage, newMessage) => {
  const message = resultMessages[oldMessage.id]
  if (message) {
    if (message._errorMessage) {
      message._errorMessage.delete();
    }
    message['_updatedMessage'] = newMessage
    processMessage(message)
  }
});

client.on("messageDelete", (oldMessage, newMessage) => {
  const message = resultMessages[oldMessage.id]
  if (message) {
    if (message._errorMessage) {
      message._errorMessage.delete();
    }
    if (message._versionMessage) {
      message._versionMessage.delete();
    }
    if (message._stdoutMessage) {
      message._stdoutMessage.delete();
    }
    if (message._stdoutAttachment) {
      message._stdoutAttachment.delete();
    }
    if (message._stderrMessage) {
      message._stderrMessage.delete();
    }
    if (message._stderrAttachment) {
      message._stderrAttachment.delete();
    }
  }
});

client.login(config.token);

function processMessage(message) {
  let updateMessages = {};
  if (message._updatedMessage) {
    updateMessages = message;
    message = message._updatedMessage;
  }
  if (!message.isMentioned(client.user) || message.author.bot) {
    return;
  }
  const content = message.cleanContent;

  const command = content.replace(/@swiftbot/g, '').trim();
  if (command == 'help' || command == '') {
    showHelp(message)
    return;
  }
  if (command == 'versions') {
    showVersions(message)
    return;
  }
  if (command == 'contribute') {
    showContribute(message)
    return;
  }

  const regex = /```[a-zA-Z]*\n([\s\S]*?\n)```/;
  const match = regex.exec(content);
  if (!match) {
    return
  }

  resultMessages[message.id] = {};

  const code = match[1];
  const args = content.split('\n');
  let parsedArguments = {};
  if (args.length > 0) {
    parsedArguments = require('yargs-parser')(args[0]);
  }

  const defaultVersion = '4.1';
  let version = parsedArguments.version || defaultVersion;
  let versions = parseVersionArgument(version)

  const defaultCommand = 'swift';
  let swiftCommand = parsedArguments.command || defaultCommand;
  if (!['swift', 'swiftc'].includes(swiftCommand)) {
    message.channel.send(`⚠️ Command '${swiftCommand}' is not supported.`)
      .then(sent => resultMessages[message.id]['_errorMessage'] = sent);
    return;
  }

  let options = parsedArguments.options || '';
  const commandInjectionOperators = [';', '&', '&&', '||', '`', '(', ')', '#'];
  if (commandInjectionOperators.some(operator => options.includes(operator))) {
    message.channel.send('⚠️ Invalid control characters found.')
      .then(sent => resultMessages[message.id]['_errorMessage'] = sent);
    return;
  }
  if (options.length == 0 && swiftCommand == defaultCommand && version == stableVersion) {
    options = '-I /usr/lib/swift/clang/include/ -I /vendor/SwiftyMath/.build/release/ -I /vendor/swift-package-libbsd/ -L /vendor/SwiftyMath/.build/release/ -ldSwiftyMath';
  }

  const defaultTimeout = 30;
  let timeout = parsedArguments.timeout || defaultTimeout;
  timeout = parseInt(timeout);
  const maxTimeout = 600;
  if (isNaN(timeout)) {
    timeout = defaultTimeout;
  } else if (timeout > maxTimeout) {
    timeout = maxTimeout;
  }

  versions.forEach(version => {
    if (!availableVersions.includes(version.toString())) {
      message.channel.send(`⚠️ Swift '${version}' toolchain is not supported.`)
        .then(sent => resultMessages[message.id]['_errorMessage'] = sent);
      return;
    }
    post(message, code, version, swiftCommand, options, timeout, updateMessages);
  });
}

function showHelp(message) {
  message.channel.send(`
\`\`\`
Usage:
  @swiftbot [--version=SWIFT_VERSION] [--command={swift, swiftc}] [--options=SWIFTC_OPTIONS]
  \`​\`​\`
  [Swift Code]
  \`​\`​\`

Examples:
  @swiftbot
  \`​\`​\`
  print("Hello world!")
  \`​\`​\`

  @swiftbot --version=4.0.3
  \`​\`​\`
  print("Hello world!")
  \`​\`​\`

  @swiftbot --command=swiftc --options=-dump-parse
  \`​\`​\`
  print("Hello world!")
  \`​\`​\`

Subcommands:
  @swiftbot versions: show available Swift toolchain versions
  @swiftbot contribute: show repository URLs
  @swiftbot help: show help
\`\`\`
    `.trim());
}

function showVersions(message) {
  message.channel.send(formatAsCodeBlock(`${availableVersions.join('\n')}`));
}

function showContribute(message) {
  message.channel.send('https://github.com/kishikawakatsumi/swift-playground');
  message.channel.send('https://github.com/kishikawakatsumi/swift-compiler-discord-bot');
}

function parseVersionArgument(argument) {
  let versions = []
  if (Array.isArray(argument)) {
    versions = argument.map(function(element) {
      return parseVersionArgument(element);
    });
  } else {
    argument = argument.toString().trim()
    if (argument.includes(',')) {
      versions = parseVersionArgument(argument.split(','))
    } else {
      if (argument == 'latest') {
        versions.push(latestVersion);
      } else if (argument == 'stable') {
        versions.push(stableVersion);
      } else {
        versions.push(argument);
      }
    }
  }
  return Array.prototype.concat.apply([], versions);
}

function formatAsCodeBlock(text) {
  return `\`\`\`\n${text}\`\`\``.trim()
}

function post(message, code, version, command, options, timeout, updateMessages) {
  const request = require("sync-request");
  const res = request('POST', 'https://swift-playground.kishikawakatsumi.com/run', {
    headers: {
      'content-type': 'application/json'
    },
    json: {code: code, toolchain_version: version, command: command, options: options, timeout: timeout},
  });

  if (res.statusCode != 200) {
    message.channel.send(`❗️Server error: ${res.statusCode}`)
      .then(sent => resultMessages[message.id]['_errorMessage'] = sent);
    return;
  }
  try {
    const results = JSON.parse(res.body);
    if (results.version) {
      if (version == latestVersion) {
        sendVersion(message, results.version, `swift-DEVELOPMENT-SNAPSHOT-${latestVersion}`, updateMessages)
      } else {
        sendVersion(message, results.version, null, updateMessages)
      }
    }
    if (results.output) {
      sendStdout(message, results.output, updateMessages);
    } else {
      if (updateMessages._stdoutMessage) {
        updateMessages._stdoutMessage.delete();
        resultMessages[message.id]['_stdoutMessage'] = null;
      }
      if (updateMessages._stdoutAttachment) {
        updateMessages._stdoutAttachment.delete();
        resultMessages[message.id]['_stdoutAttachment'] = null;
      }
    }
    if (results.errors) {
      sendStderr(message, results.errors, updateMessages);
    } else {
      if (updateMessages._stderrMessage) {
        updateMessages._stderrMessage.delete();
        resultMessages[message.id]['_stderrMessage'] = null;
      }
      if (updateMessages._stderrAttachment) {
        updateMessages._stderrAttachment.delete();
        resultMessages[message.id]['_stderrAttachment'] = null;
      }
    }

    message.react('🛠')
      .then(reaction => {
        const filter = (reaction, user) => reaction.emoji.name === '🛠' && user.id !== client.user.id;
        const collector = message.createReactionCollector(filter);
        collector.on('collect', r => post(message, code, latestVersion, command, options, timeout, {}));
      });
  } catch (e) {
    console.log(e);
    message.channel.send(`❗️Invalid JSON returned.`)
      .then(sent => resultMessages[message.id]['_errorMessage'] = sent);
  }
}

function sendVersion(message, version, snapshotVersion, updateMessages) {
  const versionLines = version.split('\n')
  let versionString = version
  if (versionLines.length > 0) {
    versionString = versionLines[0]
  }
  let content = ""
  if (snapshotVersion) {
    content = formatAsCodeBlock(`${snapshotVersion}\n${versionString}`);
  } else {
    content = formatAsCodeBlock(`${versionString}`);
  }

  if (updateMessages._versionMessage) {
    updateMessages._versionMessage.edit(content)
      .then(sent => resultMessages[message.id]['_versionMessage'] = sent);
  } else {
    message.channel.send(content)
      .then(sent => resultMessages[message.id]['_versionMessage'] = sent);
  }
}

function sendStdout(message, output, updateMessages) {
  if (output.length <= maxLength) {
    const content = formatAsCodeBlock(`${output}`);
    if (updateMessages._stdoutMessage) {
      updateMessages._stdoutMessage.edit(content)
        .then(sent => resultMessages[message.id]['_stdoutMessage'] = sent);
      if (updateMessages._stdoutAttachment) {
        updateMessages._stdoutAttachment.delete();
        resultMessages[message.id]['_stdoutAttachment'] = null;
      }
    } else {
      message.channel.send(content)
        .then(sent => resultMessages[message.id]['_stdoutMessage'] = sent);
    }
  } else {
    const messages = Util.splitMessage(output);
    if (Array.isArray(messages) && messages.length > 0) {
      const content = formatAsCodeBlock(`${messages[0]}\n...`);
      const attachment = {files: [{attachment: Buffer.from(output, 'utf8'), name: 'stdout.txt'}]};
      if (updateMessages._stdoutMessage) {
        updateMessages._stdoutMessage.edit(content)
          .then(sent => resultMessages[message.id]['_stdoutMessage'] = sent);
        if (updateMessages._stdoutAttachment) {
          updateMessages._stdoutAttachment.edit(attachment)
            .then(sent => resultMessages[message.id]['_stdoutAttachment'] = sent);
        } else {
          message.channel.send(attachment)
            .then(sent => resultMessages[message.id]['_stdoutAttachment'] = sent);
        }
      } else {
        message.channel.send(content)
          .then(sent => resultMessages[message.id]['_stdoutMessage'] = sent);
        message.channel.send(attachment)
          .then(sent => resultMessages[message.id]['_stdoutAttachment'] = sent);
      }
    }
  }
}

function sendStderr(message, errors, updateMessages) {
  if (errors.length <= maxLength) {
    const content = formatAsCodeBlock(`${errors}`);
    if (updateMessages._stderrMessage) {
      updateMessages._stderrMessage.edit(content)
        .then(sent => resultMessages[message.id]['_stderrMessage'] = sent);
      if (updateMessages._stderrAttachment) {
        updateMessages._stderrAttachment.delete();
        resultMessages[message.id]['_stderrAttachment'] = null;
      }
    } else {
      message.channel.send(content)
        .then(sent => resultMessages[message.id]['_stderrMessage'] = sent);
    }
  } else {
    const messages = Util.splitMessage(errors);
    if (Array.isArray(messages) && messages.length > 0) {
      const content = formatAsCodeBlock(`${messages[0]}\n...`);
      const attachment = {files: [{attachment: Buffer.from(errors, 'utf8'), name: 'stderr.txt'}]};
      if (updateMessages._stderrMessage) {
        updateMessages._stderrMessage.edit(content)
          .then(sent => resultMessages[message.id]['_stderrMessage'] = sent);
        if (updateMessages._stderrAttachment) {
          updateMessages._stderrAttachment.edit(attachment)
            .then(sent => resultMessages[message.id]['_stderrAttachment'] = sent);
        } else {
          message.channel.send(attachment)
            .then(sent => resultMessages[message.id]['_stderrAttachment'] = sent);
        }
      } else {
        message.channel.send(content)
          .then(sent => resultMessages[message.id]['_stderrMessage'] = sent);
        message.channel.send(attachment)
          .then(sent => resultMessages[message.id]['_stderrAttachment'] = sent);
      }
    }
  }
}
