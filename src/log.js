import { join as pathJoin } from 'path';
import { createLogger, format, transports } from 'winston';
import { PROJECT_ROOT_DIRNAME, getLocalISOString } from '../lib/utils.js';
const { combine, timestamp, printf } = format;

const myFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
});

export const logger = createLogger({
    format: combine(
        timestamp({ format: getLocalISOString }),
        myFormat
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: pathJoin(PROJECT_ROOT_DIRNAME, 'info.log') }),
    ]
});