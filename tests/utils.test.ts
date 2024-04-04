import { getSampleTranfers, verifyNumberOrder } from './utils';

describe('TEST UTILS TESTS', () => {
	test('getSampleTranfers', () => {
		const address = '0xSomething';
		const length = 3;

		const transfers = getSampleTranfers(address, length);

		expect(transfers.length).toEqual(length);
		expect(transfers[0].address).toEqual(address);
	});

	test('verifyNumbersOrder', () => {
		// INFO: Transfers' amounts are sorted in ascending order
		const sorted_items = getSampleTranfers('0xSomething', 5);

		expect(verifyNumberOrder(sorted_items, 'amount')).toBe(true);
		expect(verifyNumberOrder(sorted_items.reverse(), 'amount')).toBe(false);
	});
});
