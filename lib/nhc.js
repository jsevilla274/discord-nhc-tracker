import { XMLParser } from 'fast-xml-parser';
import { readFile } from 'fs/promises'

const USER_AGENT = 'nhc-parse-lib 1.0.0';

/**
 * Enum for basins tracked by NHC
 * @readonly
 * @enum {number}
 */
export const Basin = {
    ATLANTIC: 1,
    EASTERNPACIFIC: 2,
    CENTRALPACIFIC: 3
};

/**
 * Gets active cyclones from the given basin's RSS feed
 * @param {Basin} basin 
 * @returns {Cyclone[]}
 */
export async function getActiveCyclonesInBasinRSSFeed(basin) {
    let rssLink;
    if (basin === Basin.ATLANTIC) {
        rssLink = 'https://www.nhc.noaa.gov/index-at.xml';
    } else if (basin === Basin.CENTRALPACIFIC) {
        rssLink = 'https://www.nhc.noaa.gov/index-cp.xml';
    } else if (basin === Basin.EASTERNPACIFIC) {
        rssLink = 'https://www.nhc.noaa.gov/index-ep.xml'
    }

    const resp = await fetch(rssLink, {
        headers: {
            'User-Agent': USER_AGENT,
        },
        method: 'get'
    });

    let parsedXML = parseXMLData(await resp.text());
    if (!parsedXML.rss) {
        throw new Error(`Unable to find root of rss document from RSS feed`);
    }

    return extractCyclonesFromRSSData(parsedXML.rss);
}

function parseXMLData(xmlData) {
    const parser = new XMLParser();
    return parser.parse(xmlData);
}

/**
 * @typedef {Object} Cyclone
 * @property {String} center
 * @property {String} updateGuid - The guid of the summary update for this cyclone (usually includes datetime information)
 * @property {String} type - Type of storm (e.g. Tropical Depression, Hurricane)
 * @property {String} name - The current name given to the system by the NHC (e.g. 'Two-E', 'Katrina')
 * @property {String} wallet - An identifier for an archive of an active storm. Resuable within a season. (e.g. EP2)
 * @property {String} atcf - The unique identifier given to a system by the NHC for all of its lifetime
 * @property {String} datetime
 * @property {String} movement
 * @property {String} pressure
 * @property {String} wind
 * @property {String} headline
 */

/**
 * @param {Object} rssData XMLParser object
 * @returns {Cyclone[]}
 */
function extractCyclonesFromRSSData(rssData) {
    let foundCyclones = [];

    // channel items will hold cyclones, if any
    rssData.channel.item.forEach(item => {
        if (item.hasOwnProperty('nhc:Cyclone') === false) {
            return; // skip items without cyclone data
        }

        // create cyclone data structure
        let cyclone = {
            updateGuid: item.guid
        };
        
        let rssCycloneData = item['nhc:Cyclone'];
        for (const propName in rssCycloneData) {
            if (rssCycloneData.hasOwnProperty(propName)) {
                // remove 'nhc:' prefix
                let newPropName = propName.replace('nhc:', '');
                cyclone[newPropName] = rssCycloneData[propName];
            }
        }

        // add it to collection
        foundCyclones.push(cyclone);
    });

    return foundCyclones;
}

/**
 * Gets active cyclones from an XML file
 * @param {String} filename 
 * @returns {Cyclone[]}
 */
export async function getActiveCyclonesInBasinFile(filename) {
    // read rss data from file
    let rawXML = await readFile(filename);
    let parsedXML = parseXMLData(rawXML);
    if (!parsedXML.rss) {
        throw new Error(`Unable to find root of rss document from file`);
    }

    return extractCyclonesFromRSSData(parsedXML.rss);
}

/**
 * Obtains the latest cyclone cone graphic from NHC's archives for a specific storm
 * @param {String} cycloneWalletId 
 * @param {String} cycloneAtcfId 
 * @returns {Blob}
 */
export async function getCycloneConeImageData(cycloneWalletId, cycloneAtcfId) {
    const resp = await fetch(getCycloneConeImageLink(cycloneWalletId, cycloneAtcfId), {
        headers: {
            'User-Agent': USER_AGENT,
        },
        method: 'get'
    });

    if (resp.status !== 200) {
        throw new Error(`Unable to retrieve cyclone cone image`);
    }
    let imgBlob = await resp.blob();

    return imgBlob;
}

/**
 * Obtains the image link to the cyclone cone graphic from NHC's archives for a specific storm
 * @param {String} cycloneWalletId 
 * @param {String} cycloneAtcfId 
 * @returns {String}
 */
export function getCycloneConeImageLink(cycloneWalletId, cycloneAtcfId) {
    // add leading zero to wallet id if necessary (e.g. EP1 -> EP01)
    let walletNum = Number(cycloneWalletId.substring(2));
    if (walletNum < 10) {
        cycloneWalletId = `${cycloneWalletId.substring(0, 2)}0${walletNum}`;
    }

    return `https://www.nhc.noaa.gov/storm_graphics/${cycloneWalletId}/${cycloneAtcfId}_3day_cone_with_line_and_wind.png`;
}
