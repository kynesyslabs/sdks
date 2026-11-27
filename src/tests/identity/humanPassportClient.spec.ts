import { HumanPassportError } from '@/abstraction/types/HumanPassportTypes'

const mockGet = jest.fn()
jest.mock('axios', () => ({
    __esModule: true,
    default: { create: () => ({ get: mockGet }) }
}))

async function getScoreAfter(error: Error) {
    const { HumanPassportClient } = await import('@/identity/humanpassport/HumanPassportClient')
    mockGet.mockRejectedValueOnce(error)
    const client = HumanPassportClient.create({ apiKey: 'unused', scorerId: 'test' })
    return client.getScore('0x' + '0'.repeat(40))
}

describe('Human Passport request errors', () => {
    it('identifies a timeout without an HTTP response', async () => {
        const error = Object.assign(new Error('request timed out'), { code: 'ECONNABORTED' })
        const result = getScoreAfter(error)
        await expect(result).rejects.toHaveProperty('code', HumanPassportError.API_UNAVAILABLE)
        await expect(result).rejects.toHaveProperty('details.timeout', true)
    })

    it('does not label a connection reset as a timeout', async () => {
        const error = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
        const result = getScoreAfter(error)
        await expect(result).rejects.toHaveProperty('code', HumanPassportError.API_UNAVAILABLE)
        await expect(result).rejects.not.toHaveProperty('details.timeout')
    })

    it('prefers an HTTP status over the transport code', async () => {
        const error = Object.assign(new Error('rate limited'), {
            code: 'ECONNABORTED', response: { status: 429 }
        })
        await expect(getScoreAfter(error)).rejects.toHaveProperty('code', HumanPassportError.API_RATE_LIMITED)
    })
})
