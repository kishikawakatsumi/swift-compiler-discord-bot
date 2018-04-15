'use strict';

const { Client, MessageAttachment, Util } = require('discord.js');
const client = new Client();
const config = require("./config.json");

client.on("ready", () => {
  console.log("Swift compiler bot is ready!");
});

client.on("message", (message) => {
  if (!message.isMentioned(client.user) || message.author.bot) {
    return
  }

  const availableVersions = ['2018-04-13-a',
                             '4.1',
                             '4.0.3',
                             '3.1.1',
                             '3.0.2'];
  const latestVersion = availableVersions[0];
  const stableVersion = '4.1';

  const command = message.content.replace(new RegExp('<@' + client.user.id + '>', 'g'), '').trim();
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
  const match = regex.exec(message.content);
  if (!match) {
    return
  }

  const code = match[1];
  const args = message.content.split('\n');
  let parsedArguments = {};
  if (args.length > 0) {
    parsedArguments = require('yargs-parser')(args[0]);
  }

  const defaultVersion = '4.1';
  let version = parsedArguments.version || defaultVersion;
  if (version == 'latest') {
    version = latestVersion;
  } else if (version == 'stable') {
    version = stableVersion;
  }
  if (!availableVersions.includes(version.toString())) {
    message.channel.send(`⚠️ Swift '${version}' toolchain is not supported.`);
    return;
  }

  const defaultCommand = 'swift';
  let swiftCommand = parsedArguments.command || defaultCommand;
  if (!['swift', 'swiftc'].includes(swiftCommand)) {
    message.channel.send(`⚠️ Command '${swiftCommand}' is not supported.`);
    return;
  }

  let options = parsedArguments.options || '';
  const commandInjectionOperators = [';', '&', '&&', '||', '`', '(', ')', '#'];
  if (commandInjectionOperators.some(operator => options.includes(operator))) {
    message.channel.send('⚠️ Invalid control characters found.');
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

  const request = require("request");
  request.post({
    url: "https://swift-playground.kishikawakatsumi.com/run",
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({code: code, toolchain_version: version, command: swiftCommand, options: options, timeout: timeout})
  }, function (error, response, body) {
    const maxLength = 1950;
    const results = JSON.parse(body);

    if (results.version) {
      sendVersion(message, results.version)
    }

    if (results.output) {
      sendStdout(message, results.output)
    }

    if (results.errors) {
      sendStderr(message, results.errors)
    }
  });
});

client.login(config.token);

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
  message.channel.send(`
Available Swift versions:
\`\`\`
${availableVersions.join('\n')}
\`\`\`
    `.trim());
}

function showContribute(message) {
  message.channel.send('https://github.com/kishikawakatsumi/swift-playground');
  message.channel.send('https://github.com/kishikawakatsumi/swift-compiler-discord-bot');
}

function sendVersion(message, version) {
  const versionLines = version.split('\n')
  let versionString = version
  if (versionLines.length > 0) {
    versionString = versionLines[0]
  }
  message.channel.send(`
\`\`\`
${versionString}
\`\`\`
    `.trim());
}

function sendStdout(message, output) {
  if (output.length <= maxLength) {
    message.channel.send(`
\`\`\`
${output}
\`\`\`
      `.trim());
  } else {
    const messages = Util.splitMessage(output);
    if (Array.isArray(messages) && messages.length > 0) {
      message.channel.send(`
\`\`\`
${messages[0]}
...
\`\`\`
        `.trim());
    }
    message.channel.send({files: [{attachment: Buffer.from(output, 'utf8'), name: 'stdout.txt'}]})
  }
}

function sendStderr(message, errors) {
  if (errors.length <= maxLength) {
    message.channel.send(`
\`\`\`
${errors}
\`\`\`
      `.trim());
} else {
  const messages = Util.splitMessage(errors);
  if (Array.isArray(messages) && messages.length > 0) {
    message.channel.send(`
\`\`\`
${messages[0]}
...
\`\`\`
        `.trim());
    }
    message.channel.send({files: [{attachment: Buffer.from(errors, 'utf8'), name: 'stderr.txt'}]})
  }
}
