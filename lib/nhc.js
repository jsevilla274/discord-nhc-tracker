import { XMLParser } from 'fast-xml-parser';
import { readFile } from 'fs/promises'

const USER_AGENT = 'nhc-parse-lib 1.0.0';

/**
 * Enum for basins tracked by NHC
 * @readonly
 * @enum {Number}
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
 * @property {String} wallet - An identifier for an archive of an active storm. Resuable within a season, numbered 1-5 (e.g. AT03)
 * @property {String} seasonWallet - An identifier for the archive of an active storm within a season. (e.g. AT08)
 * @property {String} atcf - The unique identifier given to a system by the NHC for all of its lifetime. (e.g. AL082023)
 * @property {String} datetime
 * @property {String} movement
 * @property {String} pressure
 * @property {String} wind
 * @property {String} headline
 * @property {Number} hurricaneCategory - The 1 to 5 rating of the cyclone on the Saffir-Simpson Hurrican Wind Scale. Is 0 when the cyclone is not a hurricane.
 * @property {String} advisoryPubDate - The publication date for the NHC "Public Advisory" of the cyclone. This is typically updated together with the cyclone's graphic.
 */

/**
 * @param {Object} rssData XMLParser object
 * @returns {Cyclone[]}
 */
function extractCyclonesFromRSSData(rssData) {
    let foundCyclones = [];

    // find cyclones among channel items
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

        if (cyclone.hasOwnProperty('wallet')) {
            let walletBasin = cyclone.wallet.substring(0, 2);
            let walletNum = Number(cyclone.wallet.substring(2));
            // add leading zero to wallet id if necessary (e.g. EP1 -> EP01)
            if (walletNum < 10) {
                cyclone.wallet = `${walletBasin}0${walletNum}`;
            } else {
                cyclone.wallet = `${walletBasin}${walletNum}`
            }

            // build "season wallet" id
            if (cyclone.hasOwnProperty('atcf')) {
                let seasonWalletNum = Number(cyclone.atcf.substring(2, 4));
                if (seasonWalletNum < 10) {
                    cyclone.seasonWallet = `${walletBasin}0${seasonWalletNum}`;
                } else {
                    cyclone.seasonWallet = `${walletBasin}${seasonWalletNum}`;
                }
            }
        }

        // Add hurricane category property based on Saffir-Simpson Hurricane Wind Scale
        if (cyclone.hasOwnProperty('wind') && cyclone.hasOwnProperty('type')) {
            cyclone.hurricaneCategory = 0;
            if (cyclone.type.toLowerCase() === 'hurricane') {
                let windMPH = 0;
                try {
                    windMPH = Number(cyclone.wind.match(/\d+/)[0]);
                } catch (error) {}

                if (windMPH > 156) {
                    cyclone.hurricaneCategory = 5;
                } else if (windMPH > 129) {
                    cyclone.hurricaneCategory = 4;
                } else if (windMPH > 110) {
                    cyclone.hurricaneCategory = 3;
                } else if (windMPH > 95) {
                    cyclone.hurricaneCategory = 2;
                } else {
                    cyclone.hurricaneCategory = 1;
                }
            }
        }

        // add it to collection
        foundCyclones.push(cyclone);
    });

    // search through channel items once more to find public advisory data for the found cyclones
    if (foundCyclones.length > 0) {
        const publicAdvisoryReg = new RegExp(`public advisory`, 'i');
        rssData.channel.item.forEach(item => {
            if (publicAdvisoryReg.test(item.title)) {
                foundCyclones.forEach(cyclone => {
                    let titleIncludesCycloneName = new RegExp(`${cyclone.name}`, 'i').test(item.title);
                    if (titleIncludesCycloneName) {
                        cyclone.advisoryPubDate = new Date(item.pubDate).toISOString();
                    }
                });
            }
        });
    }

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
 * @param {String} cycloneSeasonWalletId 
 * @param {String} cycloneAtcfId 
 * @param {String} coneType - which cone graphic to supply. defaults to 5-day
 * @returns {String}
 */
export function getCycloneConeImageLink(cycloneSeasonWalletId, cycloneAtcfId, coneType='5day') {
    let imageLink;
    if (coneType === '3day') {
        imageLink = `https://www.nhc.noaa.gov/storm_graphics/${cycloneSeasonWalletId}/${cycloneAtcfId}_3day_cone_with_line_and_wind.png`
    } else if (coneType === '5day') {
        imageLink = `https://www.nhc.noaa.gov/storm_graphics/${cycloneSeasonWalletId}/${cycloneAtcfId}_5day_cone_with_line_and_wind.png`;
    }

    return imageLink;
}
