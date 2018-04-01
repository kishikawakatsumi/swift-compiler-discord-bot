'use strict';

const Discord = require("discord.js");
const client = new Discord.Client();

client.on("ready", () => {
  console.log("Swift compiler bot is ready!");
});

client.on("message", (message) => {
  if (message.isMentioned(client.user)) {
    const availableVersions = ['2018-03-31-a', '4.1', '4.0.3', '3.1.1', '3.0.2']

    const command = message.content.replace(new RegExp('<@' + client.user.id + '>', 'g'), '').trim();
    if (command == 'help') {
      message.channel.send('```\nUsage:\n  @swiftbot [--version=SWIFT_VERSION] [--command={swift, swiftc}] [--options=SWIFTC_OPTIONS]\n\n@swiftbot versions: show available Swift toolchain versions\n@swiftbot help: show help\n```');
      return;
    }
    if (command == 'versions') {
      message.channel.send('Available Swift versions:\n```\n' + availableVersions.join('\n') + '\n```');
      return;
    }
    console.log(command);
    console.log(command == 'contribute');
    if (command == 'contribute') {
      message.channel.send('https://github.com/kishikawakatsumi/swift-playground');
      message.channel.send('https://github.com/kishikawakatsumi/swift-compiler-discord-bot');
      return;
    }

    const regex = /```swift\n([\s\S]*?\n)```/g;
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
      if (!availableVersions.includes(version.toString())) {
        message.channel.send('Swift version \'' + version + '\' is not supported. Use \'' + defaultVersion + '\'.');
        version = defaultVersion;
      }

      const defaultCommand = 'swift';
      let command = parsedArguments.command || defaultCommand;
      if (!['swift', 'swiftc'].includes(command)) {
        message.channel.send('\'' + command + '\' is not supported. Use \'' + defaultCommand + '\'.');
        command = defaultCommand;
      }

      const options = parsedArguments.options || '';

      const defaultTimeout = 60;
      let timeout = parsedArguments.timeout || defaultTimeout;
      timeout = parseInt(timeout);
      const maxTimeout = 60;
      if (isNaN(timeout)) {
        timeout = defaultTimeout;
      } else if (timeout > maxTimeout) {
        timeout = maxTimeout;
      }

      const request = require("request");
      request.post({
        url: "https://swift-playground.kishikawakatsumi.com/run",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({code: code, toolchain_version: version, command: command, options: options, timeout: timeout})
      }, function (error, response, body) {
        const results = JSON.parse(body);
        message.channel.send('```\n' + results.version + '\n```');
        if (results.output) {
          message.channel.send('```\n' + results.output + '\n```', { split: true });
        }
        if (results.errors) {
          message.channel.send('```\n' + results.errors + '\n```', { split: true });
        }
      });
    }
  }
});

client.login("NDI5OTEzOTAyMzQwNjM2Njc1.DaIkLg.7cx7BO6-kmz4wHOyaqV2D_nQBvQ");
