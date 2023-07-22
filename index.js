import { logger } from './src/log.js';
import { main } from './src/discord-nhc-tracker.js';

try {
    await main();
} catch (error) {
    logger.error(error);
}