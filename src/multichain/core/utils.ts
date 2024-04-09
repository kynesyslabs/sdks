/**
 * Throw an error if a value is nullish
 *
 * @param {any} value The value to check
 * @param {string} msg The help text on error
 * @param {boolean} fatal should we raise an error? Default: `true`
 *
 */
export function required(
    value: any,
    msg: string = 'Missing required element',
    fatal: boolean = true
) {
    // INFO: Copied from node repo

    if (!value) {
        if (fatal) throw new Error('[REQUIRED] ' + msg)
        return false
    }

    return true
}
