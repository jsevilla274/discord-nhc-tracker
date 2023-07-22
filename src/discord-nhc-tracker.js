import './setup-env.js';
import process from 'node:process';
import { readFile, writeFile } from 'fs/promises'
import { join as pathJoin } from 'path';
import { PROJECT_ROOT_DIRNAME, toTitleCase, dateDiffInDays } from '../lib/utils.js';
import { logger } from './log.js';
import * as nhc from '../lib/nhc.js';
import * as discord from '../lib/discord.js';

export async function main() {
    let metadata = await loadMetadata();
    let recentCycloneData = await nhc.getActiveCyclonesInBasinRSSFeed(nhc.Basin.ATLANTIC);
    
    // send guild report only if tracked cyclones were updated
    if (metadata.guildTrackedCycloneIds.length > 0) {
        const { 
            updatedCyclones, 
            trackableCycloneIds 
        } = calculateTrackedCycloneUpdates(metadata.guildTrackedCycloneIds, metadata.cyclones, recentCycloneData);

        metadata.guildTrackedCycloneIds = trackableCycloneIds;

        if (updatedCyclones.length > 0) {
            logger.info('Cyclone updates found, reporting to discord guild...');
            metadata.guildReportMessageIds = await sendGuildCycloneReports(updatedCyclones, metadata.guildReportMessageIds);
        }
    }

    // send admin report only if last report occurred over a day ago
    if (dateDiffInDays(metadata.adminReportTime, new Date()) > 0) {
        logger.info('Generating new admin cyclone report...');
        metadata.adminReportMessageId = await sendAdminCycloneReport(recentCycloneData, metadata.adminReportMessageId);
        metadata.adminReportTime = new Date().toISOString();
    }
    
    // update metadata.json
    metadata.cyclones = recentCycloneData;
    await saveMetadata(metadata);
}

/**
 * Returns cyclones that have been updated in recent cyclone data. Also returns the IDs of cyclones that are 
 * still present in recent cyclone data, and are trackable
 * @param {nhc.Cyclone[]} oldCycloneData 
 * @param {nhc.Cyclone[]} recentCycloneData 
 * @returns {{updatedCyclones: nhc.Cyclone[], trackableCycloneIds: String[]}}
 */
function calculateTrackedCycloneUpdates(trackedCycloneIds, oldCycloneData, recentCycloneData) {
    // transform arrays to map
    oldCycloneData = buildCycloneMap(oldCycloneData);
    recentCycloneData = buildCycloneMap(recentCycloneData);

    // go through data
    let updatedCyclones = [];
    let trackableCycloneIds = [];
    for (const atcfId of trackedCycloneIds) {
        let oldCyclone = oldCycloneData.get(atcfId);
        let recentCyclone = recentCycloneData.get(atcfId);
        
        if (recentCyclone) {
            // still trackable
            trackableCycloneIds.push(atcfId);

            // if we don't have existing data on the cyclone or updateGuid has changed, it has been updated
            if (oldCyclone == null || oldCyclone.updateGuid !== recentCyclone.updateGuid) {
                updatedCyclones.push(recentCyclone);
            }
        } // cyclone id is no longer in recent data -> untrackable
    }

    return {
        updatedCyclones,
        trackableCycloneIds,
    }
}

/**
 * Transforms an array of cyclone data to a map that allows accessing a cyclone using its ATCF ID
 * @param {nhc.Cyclone[]} cycloneData 
 * @returns {Map<String, nhc.Cyclone>}
 */
function buildCycloneMap(cycloneData) {
    let cycloneMap = new Map();
    cycloneData.forEach(cyclone => {
        cycloneMap.set(cyclone.atcf, cyclone);
    });

    return cycloneMap;
}
 
/**
 * Stores information about data from the last time the script ran
 * @typedef {Object} Metadata
 * @property {nhc.Cyclone[]} cyclones - latest cyclone data
 * @property {String} adminReportTime - Represents last time "admin cyclone report" was generated. An ISO8061 UTC String
 * @property {String} adminReportMessageId - ID of the last admin cyclone report message sent in the admin channel
 * @property {String[]} guildTrackedCycloneIds - Cyclones to report to discord guild channel. IDs must be manually input.
 * @property {String[]} guildReportMessageIds - Last guild cyclone report message IDs generated. Used in for pinning.
 */

/**
 * Loads data stored during the last time the script ran
 * @returns {Metadata}
 */
async function loadMetadata() {
    const jsonFilename = pathJoin(PROJECT_ROOT_DIRNAME, 'metadata.json');
    let metadataRaw;
    try {        
        metadataRaw = await readFile(jsonFilename, 'utf-8');
    } catch (error) {
        // metadata file does not exist
    }

    let metadata;
    if (metadataRaw) {
        metadata = JSON.parse(metadataRaw);
    } else {
        // set up metadata structure
        metadata = {
            adminReportTime: new Date(0).toISOString(),
            adminReportMessageId: null,
            guildTrackedCycloneIds: [],
            guildReportMessageIds: [],
            cyclones: [],
        };
    }
    
    return metadata;
}

/**
 * Stores object data into metadata.json
 */
async function saveMetadata(metadataObj) {
    const jsonFilename = pathJoin(PROJECT_ROOT_DIRNAME, 'metadata.json');
    await writeFile(jsonFilename, JSON.stringify(metadataObj, null, 4));
}

/**
 * Creates a discord message for each cyclone consisting of the current forecast cone image and a formatted message 
 * to the guild channel specified in the .env file 
 * @param {nhc.Cyclone[]} cycloneData
 * @param {String[]} lastReportMessageIds - The discord message ID of the last report message(s)
 * @returns {String[]} the message IDs of the created messages
 */
async function sendGuildCycloneReports(cycloneData, lastReportMessageIds) {
    const guildChannelId = process.env.DISCORD_GUILD_CHANNEL_ID;
    let reportMessageIds = [];

    // unpin previous reports (if any)
    for (const messageId of lastReportMessageIds) {
        try {
            await discord.unpinMessageInChannel(guildChannelId, messageId);
        } catch (error) {
            logger.info(`Unable to unpin discord message id:${messageId}. Reason:${error.message}`);
        }
    }

    // create a message for each cyclone report and pin it
    for (const cyclone of cycloneData) {
        const { type, name, wallet, atcf } = cyclone;
        let formattedMessage = `## ${toTitleCase(type)} ${toTitleCase(name)} - Public Advisory Update`;
        let imgData = await nhc.getCycloneConeImageData(wallet, atcf);
        
        let message = await discord.createImageAttachmentMessageInChannel(guildChannelId, {
            messageContent: formattedMessage,
            attachments: [{
                name: `${atcf}_${Date.now()}`,
                blobData: imgData,
            }]
        });

        await discord.pinMessageInChannel(guildChannelId, message.id, true);
        reportMessageIds.push(message.id);
    }

    return reportMessageIds;
}

/**
 * Creates/updates a single discord message in the admin DM channel detailing every active cyclone and providing a link 
 * to it's current forecast cone image
 * @param {nhc.Cyclone[]} cycloneData 
 * @param {?String} lastReportMessageId - The discord message ID of the last report message
 * @returns {String} the message ID of the report message
 */
async function sendAdminCycloneReport(cycloneData, lastReportMessageId) {
    const noCyclonesFoundMessage = `There are no tropical cyclones at this time. Last updated: ${new Date().toLocaleDateString()}`;
    let message;
    let adminDMChannel = await discord.getDMChannel(process.env.DISCORD_ADMIN_ID);
    if (cycloneData.length > 0) {
        // build formatted report message
        let formattedReportMessage = '';
        cycloneData.forEach((cyclone, i) => {
            const { type, name, wallet, atcf } = cyclone;
            formattedReportMessage += `## ${toTitleCase(type)} ${toTitleCase(name)} \`ATCF:${atcf}\`\n`;
            formattedReportMessage += nhc.getCycloneConeImageLink(wallet, atcf); // link for image embed w/o download

            // add spacing after each report, but not on the last
            if (i < cycloneData.length - 1) {
                formattedReportMessage += '\n\n';
            }
        });

        // delete previous report and send new message to force a notification
        if (lastReportMessageId) {
            try {
                await discord.deleteMessageInChannel(adminDMChannel.id, lastReportMessageId);
            } catch (error) {
                logger.info(`Unable to delete discord message id:${messageId}. Reason:${error.message}`);
            }
        }
        message = await discord.createTextMessageInChannel(adminDMChannel.id, formattedReportMessage);
    } else if (lastReportMessageId) {
        try {
            message = await discord.editTextMessageInChannel(adminDMChannel.id, lastReportMessageId, noCyclonesFoundMessage);
        } catch (error) {
            logger.info(`Unable to edit discord message id:${messageId}. Reason:${error.message}`);
            message = await discord.createTextMessageInChannel(adminDMChannel.id, noCyclonesFoundMessage);
        }
    } else {
        message = await discord.createTextMessageInChannel(adminDMChannel.id, noCyclonesFoundMessage);
    }

    return message.id;
}