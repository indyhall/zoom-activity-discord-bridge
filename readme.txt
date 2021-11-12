1. Install node.js v14 or newer
2. Extract the source code to a folder, and open a command line in it
3. Run `npm install pm2 -g`
4  Run `npm install` to install dependencies
5. Set your bot's token and the commands prefix in the config.json and save it.
6. Run `npm start` to start it, then `pm2 startup` and `pm2 save` so that it auto starts on reboots.
7. You can also run `npm stop` to stop it, or `npm restart` to restart it if you made any changes.