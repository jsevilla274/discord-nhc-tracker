# discord-nhc-tracker
A script that interacts with Discord's HTTP Bot API and the NHC's RSS Feeds to report cyclone development in the Atlantic basin via Discord direct messaging. Also allows the generation of reports to a specified discord guild channel.

## Pre-requisites
* `.env` file
    * Please use `.env.sample` as a basis and see other pre-requisites to understand how to populate it
* Discord guild (server)
    * The `.env` file will require the [user ID](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-) of your Discord user to serve as the "Administrator" that will get periodic updates on cyclones via direct messaging.
    * The file will also require the [channel ID](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-) of the Discord guild channel where reports of tracked cyclones will be posted to.
* [Discord bot application](https://discord.com/developers/applications)
    * A bot token will need to be supplied in the `.env`
    * The bot will need to be invited into the target server and have the "Send Messages", "Embed Links", "Manage Messages", and "Read Message History" permissions


## Setup & Running
1. Navigate to the location you cloned this repository in and install dependencies
```
$ npm install
```
2. Run the application
```
$ node index.js
```
3. **(Optional)** Use a job scheduler like cron or Windows Task Scheduler to schedule the script to run hourly (NHC's RSS feeds update hourly)

## To report to Discord Guild Channel
After running the script once, a `metadata.json` file will be generated in the root directory of the project. This json file will hold important process data to let the script know what cyclones have been tracked and what to report next. To report cyclone updates to a channel, you must add the "ATCF ID" of one or more cyclones as a part of the "guildTrackedCycloneIds" property as follows.
```
"guildTrackedCycloneIds": [
    "AL052023",
],
```