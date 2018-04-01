'use strict';

const Discord = require("discord.js");
const client = new Discord.Client();

client.on("ready", () => {
  console.log("Swift compiler bot is ready!");
});

client.on("message", (message) => {
  if (message.isMentioned(client.user)) {
    const regex = /```swift\n([\s\S]*?\n)```/g;
    const match = regex.exec(message.content);
    if (match) {
      const code = match[1];

      const args = message.content.split('\n')
      let parsedArguments = {}
      if (args.length > 0) {
        parsedArguments = require('yargs-parser')(args[0])
      }
      const defaultVersion = '4.1'
      let version = parsedArguments.version || defaultVersion
      if (!['4.1', '4.0.3'].includes(version.toString())) {
        message.reply('Swift version \'' + version + '\' is not supported. Use \'' + defaultVersion + '\'.');
        version = defaultVersion
      }

      const defaultCommand = 'swift'
      let command = parsedArguments.command || defaultCommand
      if (!['swift', 'swiftc'].includes(command)) {
        message.reply('\'' + command + '\' is not supported. Use \'' + defaultCommand + '\'.');
        command = defaultCommand
      }

      const options = parsedArguments.options || ''
      console.log(options);

      const defaultTimeout = 60
      let timeout = parsedArguments.timeout || defaultTimeout
      timeout = parseInt(timeout)
      const maxTimeout = 60
      if (isNaN(timeout)) {
        timeout = defaultTimeout
      } else if (timeout > maxTimeout) {
        timeout = maxTimeout
      }

      const request = require("request");
      request.post({
        url: "https://swift-playground.kishikawakatsumi.com/run",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({code: code, toolchain_version: version, command: command, options: options, timeout: timeout})
      }, function (error, response, body) {
        const results = JSON.parse(body)
        message.reply('```\n' + results.errors + results.output + '\n```');
      });
    }
  }
});

client.login("NDI5OTEzOTAyMzQwNjM2Njc1.DaIkLg.7cx7BO6-kmz4wHOyaqV2D_nQBvQ");
