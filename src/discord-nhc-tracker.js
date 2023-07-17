import './setup-env.js';
import process from 'node:process';
import { readFile, writeFile } from 'fs/promises'
import { join as pathJoin } from 'path';
import { PROJECT_ROOT_DIRNAME, toTitleCase } from '../lib/utils.js';
import { logger } from './log.js';
import * as nhc from '../lib/nhc.js';
import * as discord from '../lib/discord.js';


export async function main() {
    let activeCyclones = await nhc.getActiveCyclonesInBasinRSSFeed(nhc.Basin.ATLANTIC);
    
    let metadata = await loadMetadata();
    
    let newAndUpdatedCyclones = detectNewAndUpdatedCylones(metadata.cyclones, activeCyclones);
    if (newAndUpdatedCyclones.length > 0) {
        logger.info('Cyclone updates found, reporting to discord...');

        let adminDMChannel = await discord.getDMChannel(process.env.DISCORD_ADMIN_ID);

        // delete previous admin messages (if any)
        await deleteMessagesInChannel(adminDMChannel.id, metadata.adminMessageIds);
        
        // post report(s) to admin channel
        let newReportMessageIds = await reportCycloneDataToDiscord(adminDMChannel.id, newAndUpdatedCyclones);
        metadata.adminMessageIds = newReportMessageIds;
    } else {
        logger.info('No cyclone updates found.');
    }   
    
    // update metadata.json
    metadata.cyclones = activeCyclones;
    await saveMetadata(metadata);
}


/**
 * Stores information about data from the last time the script ran
 * @typedef {Object} Metadata
 * @property {nhc.Cyclone[]} cyclones - latest cyclone data
 * @property {String[]} adminMessageIds - IDs of the last discord messages sent in the admin channel
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
            cyclones: [],
            adminMessageIds: [],
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
 * Returns cyclones that have been updated by checking the updateGuid property
 * @param {nhc.Cyclone[]} oldCycloneData 
 * @param {nhc.Cyclone[]} newCycloneData 
 * @returns {nhc.Cyclone[]}
 */
function detectNewAndUpdatedCylones(oldCycloneData, newCycloneData) {
    let newAndUpdatedCyclones = [];
    newCycloneData.forEach((newCyclone) => {
        let oldCyclone = oldCycloneData.find((oldCyclone) => oldCyclone.atcf === newCyclone.atcf);
        // use update guid to determine if data was updated
        if (newCyclone.updateGuid !== oldCyclone?.updateGuid) {
            newAndUpdatedCyclones.push(newCyclone);
        }
    });

    return newAndUpdatedCyclones;
}

async function deleteMessagesInChannel(channelId, messageIds) {
    for (const messageId of messageIds) {
        try {
            await discord.deleteMessageInChannel(channelId, messageId);
        } catch (error) {
            logger.info(`Unable to delete message id:${messageId}`);
        }
    }
}

/**
 * Creates a discord message for each cyclone consisting of the current 3-day cone image and a formatted message. 
 * @param {String} channelId - The discord channel ID to post cyclone data to
 * @param {nhc.Cyclone[]} cyclonesArr
 * @returns {String[]} the message IDs of the created messages
 */
async function reportCycloneDataToDiscord(channelId, cyclonesArr) {
    let createdMessageIDs = [];
    for (const cyclone of cyclonesArr) {
        const { type, name, wallet, atcf } = cyclone;
        let formattedMessage = `## ${toTitleCase(type)} ${toTitleCase(name)} Public Advisory Update`;
        let imgData = await nhc.getCycloneConeImageData(wallet, atcf);
        
        let message = await discord.createImageAttachmentMessageInChannel(channelId, {
            messageContent: formattedMessage,
            attachments: [{
                name: `${atcf}_${Date.now()}`,
                blobData: imgData,
            }]
        });

        createdMessageIDs.push(message.id);
    }

    return createdMessageIDs;
}