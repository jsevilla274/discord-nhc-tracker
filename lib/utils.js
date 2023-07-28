import { resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';

/**
* @returns the absolute path of the project root directory
*/
export const PROJECT_ROOT_DIRNAME = pathResolve(fileURLToPath(import.meta.url), '../..');

/**
 * e.g. "test string" -> "Test String"
 * @param {String} str 
 * @returns {String}
 */
export function toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

/**
 * Gets an ISO string of the date and time in the local timezone of the system where the process is running
 * @param {?Date} date - Date object. If none supplied defaults to new Date()
 * @returns {String}
 */
export function getLocalISOString(date) {
    date = date?.getDate() ? date : new Date();
    
    let month = (date.getMonth() > 8) ? (date.getMonth() + 1) : ('0' + (date.getMonth() + 1));
    let day = (date.getDate() > 9) ? date.getDate() : ('0' + date.getDate());
    let year = date.getFullYear();
    let hours = (date.getHours() > 9) ? date.getHours() : ('0' + date.getHours());
    let minutes = (date.getMinutes() > 9) ? date.getMinutes() : ('0' + date.getMinutes());
    let seconds = (date.getSeconds() > 9) ? date.getSeconds() : ('0' + date.getSeconds());
    let ms = date.getMilliseconds();
    if (ms < 10) {
        ms = '00' + ms;
    } else if (ms < 100) {
        ms = '0' + ms;
    }
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * @param {Date|String} date1 
 * @param {Date|String} date2 
 * @returns {Number}
 */
export function dateDiffInDays(date1, date2) {
    if (typeof date1 === 'string') {
        date1 = new Date(date1);
    }
    if (typeof date2 === 'string') {
        date2 = new Date(date2);
    }
    return Math.floor(Math.abs(date1.getTime() - date2.getTime()) / (1000 * 3600 * 24));
}

/**
 * @param {Date|String} date 
 * @param {Number} days
 * @returns {Date} new instance of date
 */
export function addDaysToDate(date, days) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    let newDate = new Date(date.valueOf());
    newDate.setDate(date.getDate() + days);
    return newDate;
}