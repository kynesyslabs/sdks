/**
 * INFO Small module to quickly implement a require-like method as seen in Solidity
 * NOTE Either causes an exception or returns false if the requirement is not met.
 *
 * @author TheCookingSenpai
 * @date 2/9/2023 - 04:15:18
 *
 * @param {any} value
 * @param {boolean} is_fatal
 * @returns {void | boolean}
 */
export function required(value: any, is_fatal: boolean = true): void | boolean {
	if (!value) {
		if (is_fatal) {
			throw new Error('Value of ' + value + ' is required and failed');
		} else {
			return false;
		}
	}
	// Requirements are met
	return true;
}

/**
 * Throw an error if a value is nullish
 *
 * @param {any} value The value to check
 * @param {string} msg The help text on error
 * @param {boolean} fatal should we raise an error? Default: `true`
 *
 */
export function _required(value: any, msg: string = 'Missing required element', fatal: boolean = true) {
	// INFO: Copied from node repo

	if (!value) {
		if (fatal) throw new Error('[REQUIRED] ' + msg);
		return false;
	}

	return true;
}
