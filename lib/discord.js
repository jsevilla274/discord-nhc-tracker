import process from 'node:process';

const DISCORD_EPOCH = 1420070400000;
const USER_AGENT = 'DiscordBot (discord-lib, 1.0.0)';

/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-types
 * @readonly
 * @enum {Number}
 */
export const MessageType = {
    DEFAULT: 0,
    CHANNEL_PINNED_MESSAGE: 6,
};

/**
 * https://discord.com/developers/docs/reference#snowflakes
 * @param {Date} date 
 * @returns {String}
 */
function getSnowflakeIdFromDate(date = new Date()) {
    return (BigInt(date.getTime() - DISCORD_EPOCH) << 22n).toString();
}

/**
 * Performs a request against Discord's api
 * @param {String} endpoint - The Discord api endpoint
 * @param {Object} options - Options to pass into the request
 * @returns {Object} The response data of the request
 */
export async function discordRequest(endpoint, options) {
    // stringify payload
    if (options.body) {
        options.body = JSON.stringify(options.body);
    }

    // append endpoint to root API URL
    let resp = await fetch(`https://discord.com/api/v10/${endpoint}`, {
        headers: {
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'User-Agent': USER_AGENT,
            'Accept-Encoding': 'gzip,deflate,compress',
        },
        ...options
    });

    let respData;
    if (resp.status === 200) {
        respData = await resp.json();
    } else if (resp.status !== 204) {
        // if not 204 (empty response), throw API errors
        throw new Error(`Unexpected status ${resp.status} ${resp.statusText}.`);
    }

    return respData;
}

/**
 * Discord message object https://discord.com/developers/docs/resources/channel#message-object
 * @typedef {Object} Message
 */

/**
 * Discord channel object https://discord.com/developers/docs/resources/channel#channel-object
 * @typedef {Object} Channel
 */

/**
 * Searches for messages in a given channel between the start (inclusive) and end date (non-inclusive). If both dates are
 * supplied, will perform a best effort to retrieve all messages between the two dates in the channel (limited by memory 
 * and discord API). If only afterDate is supplied, it will return the first N messages (limit) after this date. 
 * Otherwise, it will return the first N message before beforeDate or the current date. No message order guaranteed.
 * @param {String} channelId - Discord channel id to search messages in
 * @param {?String|Date} afterDate - The end of the date range to search messages
 * @param {?String|Date} beforeDate - The start of the date range to search messages
 * @param {?Number} limit - Number of messages to return. Default: 100; also the max when not searching between two dates.
 * @returns {Message[]}
 */
export async function getMessagesInChannel(channelId, afterDate, beforeDate, limit=100) {
    if (typeof afterDate === 'string') afterDate = new Date(afterDate);
    if (typeof beforeDate === 'string') beforeDate = new Date(beforeDate);

    let urlParams = {
        limit,
    };
    let shouldPaginate = false;
    if (afterDate && beforeDate) {
        shouldPaginate = true;
        urlParams.after = getSnowflakeIdFromDate(afterDate);
    } else if (beforeDate) {
        urlParams.before = getSnowflakeIdFromDate(beforeDate);
    } else if (afterDate) {
        urlParams.after = getSnowflakeIdFromDate(afterDate);
    } else {
        urlParams.before = getSnowflakeIdFromDate();
    }

    let messages = [];
    do {
        let urlParamStr = new URLSearchParams(urlParams).toString();
        let respData = await discordRequest(`channels/${channelId}/messages?${urlParamStr}`, {
            method: 'get'
        });

        let respMessages = respData;
        if (shouldPaginate) {
            // filter messages by date
            let doneFiltering = false;
            let latestMessageDate = new Date(DISCORD_EPOCH); // earliest date in discord
            let latestMessageId;
            for (let i = 0; i < respMessages.length; i++) {
                const message = respMessages[i];
                const messageDate = new Date(message.timestamp);
                if (messageDate < beforeDate) {
                    messages.push(message);
                } else {
                    doneFiltering = true;
                }

                if (messageDate > latestMessageDate) {
                    latestMessageDate = messageDate;
                    latestMessageId = message.id;
                }
            }

            // set the id of the last message as the "after" parameter (used for pagination)
            urlParams.after = latestMessageId;

            // determine if we should keep making requests for more messages
            shouldPaginate = (respMessages.length === urlParams.limit && doneFiltering === false);
        } else {
            messages = respMessages;
        }

    } while (shouldPaginate);

    return messages;
}

/**
 * @param {String} channelId - Discord channel id to send a message in
 * @param {String} messageContent - The text message to send
 * @returns {Message}
 */
export async function createTextMessageInChannel(channelId, messageContent) {
    let respData = await discordRequest(`channels/${channelId}/messages`, {
        method: 'post',
        body: { 
            content: messageContent,
        },
    });

    return respData;
}

/**
 * @param {String} channelId
 * @returns {Message[]}
 */
export async function getPinnedMessagesInChannel(channelId) {
    let respData = await discordRequest(`/channels/${channelId}/pins`, {
        method: 'get'
    });

    return respData;
}

/**
 * @param {String} channelId 
 * @param {String} messageId 
 * @param {Boolean} deletePinNotification 
 */
export async function pinMessageInChannel(channelId, messageId, deletePinNotification) {
    await discordRequest(`/channels/${channelId}/pins/${messageId}`, {
        method: 'put'
    });

    if (deletePinNotification) {
        await deleteRecentPinNotification(channelId, messageId);
    }
}

/**
 * @param {String} channelId 
 * @param {String} pinnedMessageId
 */
async function deleteRecentPinNotification(channelId, pinnedMessageId) {
    let recentMessages = await getMessagesInChannel(channelId, null, null, 10); // return only last 10 messages
    let pinNotificationMessage = recentMessages.find((message) => {
        return message.type === MessageType.CHANNEL_PINNED_MESSAGE && message.message_reference.message_id === pinnedMessageId;
    })
    if (pinNotificationMessage) {
        await deleteMessageInChannel(channelId, pinNotificationMessage.id);
    } else {
        throw new Error(`Unable to find pin notification for message id:${pinnedMessageId}`);
    }
}

/**
 * @param {String} channelId 
 * @param {String} messageId 
 */
export async function unpinMessageInChannel(channelId, messageId) {
    await discordRequest(`/channels/${channelId}/pins/${messageId}`, {
        method: 'delete'
    });
}

/**
 * @param {String} userId 
 * @returns {Channel}
 */
export async function getDMChannel(userId) {
    let respData = await discordRequest(`/users/@me/channels`, {
        method: 'post',
        body: { 
            recipient_id: userId,
        },
    });

    return respData;
}

/**
 * @param {String} channelId 
 * @param {String} messageId 
 */
export async function deleteMessageInChannel(channelId, messageId) {
    await discordRequest(`/channels/${channelId}/messages/${messageId}`, {
        method: 'delete'
    });
}

/**
 * Options to create an image attachment
 * @typedef {Object} ImageAttachment
 * @property {String} name - Name to give the image attachment
 * @property {Blob} blobData - The image data as a Blob
 */

/**
 * @param {Object} options
 * @param {?String} options.messageContent - Text message content to send with attachments
 * @param {ImageAttachment[]} options.attachments - Image attachments
 * @returns {Message}
 */
export async function createImageAttachmentMessageInChannel(channelId, options) {
    // add attachment data to formdata
    let formData = new FormData();
    let attachmentsMetadata = [];
    if (Array.isArray(options.attachments)) {
        for (let i = 0; i < options.attachments.length; i++) {
            const attachment = options.attachments[i];
            let filename = `${attachment.name}.${imgExtFromMimeType(attachment.blobData.type)}`
            // collect metadata
            attachmentsMetadata.push({
                id: i,
                filename,
            });
    
            // append raw data to formdata
            formData.append(`files[${i}]`, attachment.blobData, filename);
        }
    }

    // create payload json for metadata and append it to formdata
    let payloadJson = {};
    if (options.messageContent) {
        payloadJson.content = options.messageContent;
    }
    if (attachmentsMetadata.length > 0) {
        payloadJson.attachments = attachmentsMetadata;
    }

    formData.append('payload_json', JSON.stringify(payloadJson));
      
    // post data
    let resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        headers: {
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            'User-Agent': USER_AGENT,
            'Accept-Encoding': 'gzip,deflate,compress',
            // don't set Content-Type
        },
        method: 'post',
        body: formData,
    });

    let respData;
    if (resp.status === 200) {
        respData = await resp.json();
    } else {
        throw new Error(`Unexpected status ${resp.status} ${resp.statusText}.`);
    }

    return respData;
}

function imgExtFromMimeType(mimeType) {
    let fileExt;
    if (mimeType === "image/png") {
        fileExt = 'png';
    } else if (mimeType === "image/jpeg") {
        fileExt = 'jpeg';
    } else if (mimeType === "image/gif") {
        fileExt = 'gif';
    } else {
        throw new Error(`Unsupported image mime type '${mimeType}'`)
    }

    return fileExt;
}

/**
 * @param {String} channelId - Discord channel id the message was sent in
 * @param {String} messageId - Discord message id
 * @param {String} messageContent - The new text message
 * @returns {Message}
 */
export async function editTextMessageInChannel(channelId, messageId, messageContent) {
    let respData = await discordRequest(`channels/${channelId}/messages/${messageId}`, {
        method: 'patch',
        body: { 
            content: messageContent,
        },
    });

    return respData;
}
