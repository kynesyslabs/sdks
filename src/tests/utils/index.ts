import { IPayOptions } from "@/multichain/core"

/**
 * Verify that keys in a list of items appear in ascending order
 * @param items The list of items
 * @param key The key to compare
 * @param options.isNonce Are we comparing nonces?
 *
 * @returns A boolean indicating whether the keys are in order
 */
export function verifyNumberOrder(
    items: any[],
    key: string,
    options: { isNonce: boolean } = { isNonce: false },
) {
    // INFO: If is nonce, verify that each number is greater than the previous one by 1
    const predicate = options.isNonce
        ? (current: number, prev: number) => current === prev + 1
        : (current: number, prev: number) => current > prev

    return items.every((num, i) => {
        const current = Number(num[key])
        const prev = Number(items[i - 1]?.[key])

        return i === 0 || predicate(current, prev)
    })
}

/**
 * Generate a list of transaction params for testing
 * @param address The address to send the transactions to
 * @returns A list of transaction params ready to be passed to preparePays
 */
export function getSampleTranfers(
    address: string,
    startFrom: number = 1,
    length: number = 9,
): IPayOptions[] {
    return Array.from({ length }, (_, i) => {
        return {
            address,
            // INFO: Amount is passed to preparePays as a string
            amount: startFrom.toString() + i,
            // amount: 0.1,
        }
    })
}
