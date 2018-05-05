'use strict';

const { Client, RichEmbed, Attachment, Util, Constants } = require('discord.js');
const client = new Client();

const config = require("./config.json");
const maxLength = 1000;

String.prototype.toCodeBlock = function(format = '') {
  return `
\`\`\`${format}
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
const executed = {};

client.on(Constants.Events.READY, () => {
  console.log("Swift compiler bot is ready!");
});

client.on(Constants.Events.MESSAGE_CREATE, (message) => {
  processMessage(message).then(content => {
    if (content) {
      message.channel.send(content).then(sentMessage => {
        if (sentMessage) {
          replyMessages[message.id] = sentMessage;
          if (executed[message.id]) {
            message.react('🛠').then(reaction => {
              const filter = (reaction, user) => reaction.emoji.name === '🛠' && user.id !== client.user.id;
              const collector = message.createReactionCollector(filter);
              collector.on('collect', reaction => {
                const code = executed[message.id]
                if (code) {
                  Promise.all([run(code.code, 'latest', code.command, code.options, code.timout)]).then(results =>{
                    message.channel.send(makeEmbed(message, code.code, results));
                  });
                }
              });
            });
          }
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
    embed.setAuthor(
      'Kishikawa Katsumi',
      'https://cdn.discordapp.com/avatars/291075091025100810/39d60f97ea2bca395f1992c42f25107c.png',
      'https://kishikawakatsumi.com'
    );
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
    if (subcommand == '!install -l' || subcommand == '!install --list') {
      installList().then(res => {
        message.channel.send(res.data.repository.refs.tags.map(tag => (tag.name)).slice(0, 10).join('\n') + '\n...', {code: true, split: true});
      });
      return new Promise((resolve, reject) => { resolve(); });
    }
    if (subcommand.startsWith('!install')) {
      let tag = subcommand.split(' ')[1];
      let branch = ''
      let version = ''
      if (tag.includes('DEVELOPMENT')) {
        if (tag.startsWith('swift-DEVELOPMENT')) {
          branch = 'development';
        } else {
          branch = tag.split('DEVELOPMENT')[0] + 'branch';
        }
        version = tag.split('DEVELOPMENT-SNAPSHOT-')[1];
      } else if (tag.includes('RELEASE')) {
        branch = tag.toLowerCase();
        version = tag.replace(/swift-/g, '').replace(/-RELEASE/g, '');
      } else {
        message.channel.send(`Cannot install '${tag}' version of Swift`, {code: true});
        return new Promise((resolve, reject) => { resolve(); });
      }

      const command = `docker build --no-cache=true --rm=true --tag=kishikawakatsumi/swift:${version} . --build-arg SWIFT_BRANCH=${branch} --build-arg SWIFT_VERSION=${tag}`
      execCommand(command, message);

      return new Promise((resolve, reject) => { resolve(); });
    }

    execCommand(subcommand.substr(1), message);
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
      '-I /Libraries/All/.build/release',
      '-L /Libraries/All/.build/release',
      '-lAll'
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
      if (version.length == 1) {
        version = parseInt(version).toFixed(1).toString();
      }
      executed[message.id] = {code: code, version: version, command: command, options: options, timeout: timeout};
      return run(code, version, command, options, timeout);
    })
  ).then(results => {
    return makeEmbed(message, code, results);
  });
}

function run(code, version, command, options, timeout) {
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
    } else {
      embedContents['version'] = `⚠️ ${version}`.toCodeBlock();
      embedContents['stderr'] = {text: results.errors.toCodeBlock()};
      return embedContents;
    }
    if (results.output) {
      if (results.output.length <= maxLength) {
        embedContents['stdout'] = {text: results.output.toCodeBlock()};
      } else {
        const splitMessage = Util.splitMessage(results.output, {maxLength: maxLength});
        if (Array.isArray(splitMessage) && splitMessage.length > 0) {
          embedContents['stdout'] = {};
          embedContents.stdout['text'] = `${splitMessage[0]}\n...`.toCodeBlock();
          embedContents.stdout['file'] = new Attachment(Buffer.from(results.output, 'utf8'), `stdout-${version}.txt`);
        }
      }
    } else {
      embedContents['stdout'] = {text: ''.toCodeBlock()};
    }
    if (results.errors) {
      if (results.errors.length <= maxLength) {
        embedContents['stderr'] = {text: results.errors.toCodeBlock()};
      } else {
        const splitMessage = Util.splitMessage(results.errors, {maxLength: maxLength});
        if (Array.isArray(splitMessage) && splitMessage.length > 0) {
          embedContents['stderr'] = {};
          embedContents.stderr['text'] = `${splitMessage[0]}\n...`.toCodeBlock();
          embedContents.stderr['file'] = new Attachment(Buffer.from(results.errors, 'utf8'), `stderr-${version}.txt`);
        }
      }
    } else {
      embedContents['stderr'] = {text: ''.toCodeBlock()};
    }

    return embedContents;
  }).catch(error => {
    return `❗️Unexpected error: ${error}`;
  });
}

function makeEmbed(message, code, results) {
  const embed = new RichEmbed();

  embed.setAuthor(message.author.username, message.author.avatarURL);
  embed.setDescription(code.toCodeBlock('swift'))
  embed.setTimestamp(new Date());

  results.forEach(result => {
    if (result.version) {
      embed.addField('Version:', result.version);
    }
    if (result.stdout && result.stdout.text) {
      embed.addField('Output:', result.stdout.text);
    }
    if (result.stdout && result.stdout.file) {
      message.channel.send(result.stdout.file);
    }
    if (result.stderr && result.stderr.text) {
      embed.addField('Error:', result.stderr.text);
    }
    if (result.stderr && result.stderr.file) {
      message.channel.send(result.stderr.file);
    }
  });

  return embed;
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

function installList() {
  const { createApolloFetch } = require('apollo-fetch');
  const fetch = createApolloFetch({
    uri: 'https://api.github.com/graphql',
  });
  fetch.use(({ request, options }, next) => {
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['Authorization'] = `bearer ${config.github_token}`;
    options.headers['Accept'] = 'application/vnd.github.v4.idl';
    next();
  });

  return fetch({
    query: `
      query ($owner: String!, $name: String!, $cursor: String = "") {
        repository(owner: $owner, name: $name) {
          refs(refPrefix: "refs/tags/", first: 100, after: $cursor, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
            pageInfo {
              endCursor
              hasNextPage
              startCursor
            }
            tags: nodes {
              name
            }
          }
        }
      }
    `,
    variables: { owner: 'apple', name: 'swift', cursor: '' }
  });
}

function execCommand(command, message) {
  let result = '';
  try {
    result = require('child_process').execSync(command).toString();
  } catch (e) {
    result = e.stderr.toString();
  }

  if (result.length <= 2000) {
    message.channel.send(result, {code: true});
  } else {
    const splitMessage = Util.splitMessage(result);
    if (Array.isArray(splitMessage) && splitMessage.length > 0) {
      message.channel.send(`${splitMessage[0]}\n...`.toCodeBlock(), new Attachment(Buffer.from(result, 'utf8'), `log.txt`));
    }
  }
}
