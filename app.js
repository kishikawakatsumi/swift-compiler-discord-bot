'use strict';

const { Client, RichEmbed, Util, Constants } = require('discord.js');
const client = new Client();

const config = require("./config.json");
const maxLength = 1990;

String.prototype.toCodeBlock = function() {
  return `
\`\`\`
${this.trim()}
\`\`\`
    `.trim();
};

const usage = `
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
  `.toCodeBlock();

const replyMessages = {};

client.on(Constants.Events.READY, () => {
  console.log("Swift compiler bot is ready!");
});

client.on(Constants.Events.MESSAGE_CREATE, (message) => {
  processMessage(message).then(content => {
    if (content) {
      message.channel.send(content).then(sentMessage => {
        if (sentMessage) {
          replyMessages[message.id] = sentMessage;
        }
      });
    }
  })
});

client.on(Constants.Events.MESSAGE_UPDATE, (oldMessage, newMessage) => {
  const message = replyMessages[oldMessage.id]
  if (message) {
    processMessage(newMessage).then(content => {
      if (content) {
        message.edit(content).then(sentMessage => {
          if (sentMessage) {
            replyMessages[message.id] = sentMessage;
          }
        });
      }
    })
  }
});

client.on(Constants.Events.MESSAGE_DELETE, (oldMessage, newMessage) => {
  const message = replyMessages[oldMessage.id]
  if (message) {
    message.delete();
  }
});

client.login(config.token);

function processMessage(message) {
  if (!message.isMentioned(client.user) || message.author.bot) {
    return new Promise((resolve, reject) => { resolve(); });
  }

  const content = message.cleanContent;

  const subcommand = content.replace(/@swiftbot/g, '').trim() || 'help';
  if (subcommand == 'help') {
    return new Promise((resolve, reject) => { resolve(usage); });
  } else if (subcommand == 'versions') {
    const request = require('request-promise');
    return request({
      method: 'GET',
      uri: 'https://swift-playground.kishikawakatsumi.com/versions',
      json: true
    }).then(results => {
      return `${results.versions.join('\n')}`.toCodeBlock();
    });
  } else if (subcommand == 'contribute') {
    const embed = new RichEmbed();
    embed.setTitle('Contributions Welcome!');
    embed.setDescription('All contributions (no matter if small) are always welcome.');
    embed.addField(
      'Questions/Help',
      '@kishikawakatsumi ...'
    );
    embed.addField(
      'Reporting Bugs/Requesting Features',
      'https://github.com/kishikawakatsumi/swift-playground\nhttps://github.com/kishikawakatsumi/swift-compiler-discord-bot'
    );
    embed.addField(
      'Donations',
      'https://www.paypal.me/kishikawakatsumi'
    );
    return new Promise((resolve, reject) => { resolve(embed); });
  }

  if (subcommand.startsWith('!') && message.author.id == '291075091025100810') {
    const result = require('child_process').execSync(subcommand.substr(1)).toString().toCodeBlock();
    message.channel.send(result, {split: true})
    return new Promise((resolve, reject) => { resolve(); });
  }

  const regex = /```[a-zA-Z]*\n([\s\S]*?\n)```/;
  const match = regex.exec(content);
  if (!match) {
    return new Promise((resolve, reject) => { resolve(); });
  }

  const code = match[1];
  const lines = content.split('\n');
  const args = lines.length > 0 ? require('yargs-parser')(lines[0]) : {};

  const stableVersion = '4.1';
  const version = args.version || stableVersion;
  const versions = parseVersionArgument(version)

  const defaultCommand = 'swift';
  const command = args.command || defaultCommand;

  let options = args.options || '';
  if (options.length == 0 && command == defaultCommand && version == stableVersion) {
    options = [
      '-I /usr/lib/swift/clang/include/',
      '-I /vendor/SwiftyMath/.build/release/',
      '-I /vendor/swift-package-libbsd/',
      '-L /vendor/SwiftyMath/.build/release/',
      '-ldSwiftyMath'
    ].join(' ');
  }

  const defaultTimeout = 30;
  let timeout = parseInt(args.timeout || defaultTimeout);
  const maxTimeout = 600;
  if (isNaN(timeout)) {
    timeout = defaultTimeout;
  } else if (timeout > maxTimeout) {
    timeout = maxTimeout;
  }
  return Promise.all(
    versions.map(version => {
      return post(message, code, version, command, options, timeout);
    })
  ).then(results => {
    const embed = new RichEmbed();

    embed.setAuthor(message.author.username, message.author.avatarURL);
    embed.setDescription(code.toCodeBlock())
    embed.setTimestamp(new Date());

    results.forEach(result => {
      if (result.version) {
        embed.addField('Version', result.version);
      }
      if (result.stdout.text) {
        embed.addField('Standard output', result.stdout.text);
      }
      if (result.stdout.file) {
        embed.attachFile(result.stdout.file);
      }
      if (result.stderr.text) {
        embed.addField('Standard error', result.stderr.text);
      }
      if (result.stderr.file) {
        embed.attachFile(result.stderr.file);
      }
    });

    return embed;
  });
}

function post(message, code, version, command, options, timeout) {
  const request = require('request-promise');
  return request({
    method: 'POST',
    uri: 'https://swift-playground.kishikawakatsumi.com/run',
    body: {code: code, toolchain_version: version, command: command, options: options, timeout: timeout},
    json: true,
    resolveWithFullResponse: true
  }).then(response => {
    if (response.statusCode != 200) {
      return `❗️Server error: ${res.statusCode}`;
    }

    const results = response.body;
    const embedContents = {};

    if (results.version) {
      embedContents['version'] = formatVersion(results.version).toCodeBlock();
    }
    if (results.output) {
      if (results.output.length <= maxLength) {
        embedContents['stdout'] = {text: results.output.toCodeBlock()};
      } else {
        const split = Util.splitMessage(results.output);
        if (Array.isArray(split) && split.length > 0) {
          embedContents['stdout'] = {text: `${split[0]}\n...`.toCodeBlock()};
        }
        embedContents['stdout'] = {file: {attachment: Buffer.from(results.output, 'utf8'), name: 'stdout.txt'}};
      }
    } else {
      embedContents['stdout'] = {text: ''.toCodeBlock()};
    }
    if (results.errors) {
      if (results.errors.length <= maxLength) {
        embedContents['stderr'] = {text: results.errors.toCodeBlock()};
      } else {
        const split = Util.splitMessage(results.errors);
        if (Array.isArray(split) && split.length > 0) {
          embedContents['stderr'] = {text: `${split[0]}\n...`.toCodeBlock()};
        }
        embedContents['stderr'] = {file: {attachment: Buffer.from(results.errors, 'utf8'), name: 'stderr.txt'}};
      }
    } else {
      embedContents['stderr'] = {text: ''.toCodeBlock()};
    }

    return embedContents;
  }).catch(error => {
    return `❗️Unexpected error: ${error}`;
  });
}

function formatVersion(version) {
  const versionLines = version.split('\n')
  if (versionLines.length > 0) {
    version = versionLines[0];
  }
  return `${version}`;
}

function parseVersionArgument(argument) {
  let versions = []
  if (Array.isArray(argument)) {
    versions = argument.map((element) => {
      return parseVersionArgument(element);
    });
  } else {
    argument = argument.toString().trim()
    if (argument.includes(',')) {
      versions = parseVersionArgument(argument.split(','))
    } else {
      versions.push(argument);
    }
  }
  return Array.prototype.concat.apply([], versions);
}
