'use strict';

const { Client, MessageAttachment, Util } = require('discord.js');
const client = new Client();

client.on("ready", () => {
  console.log("Swift compiler bot is ready!");
});

client.on("message", (message) => {
  if (!message.isMentioned(client.user) || message.author.bot) {
    return
  }

  const availableVersions = ['2018-04-10-a',
                             '2018-04-08-a',
                             '2018-04-06-a',
                             '2018-04-04-a',
                             '2018-04-03-a',
                             '2018-04-02-a',
                             '2018-04-01-a',
                             '2018-03-31-a',
                             '4.1',
                             '4.0.3',
                             '3.1.1',
                             '3.0.2'];
  const latestVersion = availableVersions[0];
  const stableVersion = '4.1';

  const command = message.content.replace(new RegExp('<@' + client.user.id + '>', 'g'), '').trim();
  if (command == 'help' || command == '') {
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
    return;
  }
  if (command == 'versions') {
    message.channel.send(`
Available Swift versions:
\`\`\`
${availableVersions.join('\n')}
\`\`\`
      `.trim());
    return;
  }
  if (command == 'contribute') {
    message.channel.send('https://github.com/kishikawakatsumi/swift-playground');
    message.channel.send('https://github.com/kishikawakatsumi/swift-compiler-discord-bot');
    return;
  }

  const regex = /```[a-zA-Z]*\n([\s\S]*?\n)```/;
  const match = regex.exec(message.content);
  if (match) {
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
    let command = parsedArguments.command || defaultCommand;
    if (!['swift', 'swiftc'].includes(command)) {
      message.channel.send(`⚠️ Command '${command}' is not supported.`);
      return;
    }

    let options = parsedArguments.options || '';
    const commandInjectionOperators = [';', '&', '&&', '||', '`', '(', ')', '#'];
    if (commandInjectionOperators.some(operator => options.includes(operator))) {
      message.channel.send('⚠️ Invalid control characters found.');
      return;
    }
    if (options.length == 0 && command == defaultCommand && version == stableVersion) {
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
      body: JSON.stringify({code: code, toolchain_version: version, command: command, options: options, timeout: timeout})
    }, function (error, response, body) {
      const maxLength = 1950;
      const results = JSON.parse(body);

      if (results.version) {
        const versionLines = results.version.split('\n')
        let versionString = results.version
        if (versionLines.length > 0) {
          versionString = versionLines[0]
        }
        message.channel.send(`
\`\`\`
${versionString}
\`\`\`
          `.trim());
      }

      if (results.output) {
        if (results.output.length <= maxLength) {
          message.channel.send(`
\`\`\`
${results.output}
\`\`\`
            `.trim());
        } else {
          const messages = Util.splitMessage(results.output);
          if (Array.isArray(messages) && messages.length > 0) {
            message.channel.send(`
\`\`\`
${messages[0]}
...
\`\`\`
              `.trim());
          }
          message.channel.send({files: [{attachment: Buffer.from(results.output, 'utf8'), name: 'stdout.txt'}]})
        }
      }

      if (results.errors) {
        if (results.errors.length <= maxLength) {
          message.channel.send(`
\`\`\`
${results.errors}
\`\`\`
            `.trim());
        } else {
          const messages = Util.splitMessage(results.errors);
          if (Array.isArray(messages) && messages.length > 0) {
            message.channel.send(`
\`\`\`
${messages[0]}
...
\`\`\`
              `.trim());
          }
          message.channel.send({files: [{attachment: Buffer.from(results.errors, 'utf8'), name: 'stderr.txt'}]})
        }
      }
    });
  }
});

client.login("NDI5OTEzOTAyMzQwNjM2Njc1.DaIkLg.7cx7BO6-kmz4wHOyaqV2D_nQBvQ");
