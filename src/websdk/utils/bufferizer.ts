import { IBufferized } from '../types/IBuffer'

/**
 * Converting uint8arrays into node.js-like objects representing a Buffer
 * @date 2/9/2023 - 04:47:48
 *
 * @param {*} uint8array
 * @returns {{ type: string; data: {}; }}
 */
export function bufferize(uint8array: Uint8Array): IBufferized {
    const buffer = { type: 'Buffer', data: <number[]>[] }
    for (let i = 0; i < uint8array.length; i++) {
        buffer.data.push(uint8array[i])
    }
    return buffer
}