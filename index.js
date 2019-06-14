const debug = require('debug');
const axios = require('axios');
const UUID = require('uuid/v4')

const log = debug('eating-out-deterrent');
const dump = log.extend('DUMP');

const config = {
	accessToken: process.env.ACCESS_TOKEN,
	apiURL: 'https://api.starlingbank.com/api/v2/',
	targetSpendingCategory: 'EATING_OUT',
	// ToDo: variable changesSince
	feedChangesSince: '2019-05-01T00:00:00.000Z'
};

if (config.accessToken === undefined) {
	throw new Error('An accessToken value is needed. Not found as environment variable.');
}

const client = axios.create({
	baseURL: config.apiURL,
	headers: {
		Accept: 'application/json',
		Authorization: `Bearer ${config.accessToken}`,
		'Content-Type': 'application/json'
	}
});
function logError(error) {
	log('Error: %O', error.response || error.request || error.message);
	return Promise.reject(error);
}
client.interceptors.request.use(function (config) {
	dump('Requesting \'%s\' on \'%s\' with data: %j', config.method, config.url, config.data);
	return config;
}, logError);
client.interceptors.response.use(function (response) {
	dump('\'%s\' returned %d<%s>:\n%O', response.config.url, response.status, response.statusText, response.data);
	return response;
}, logError);

function getAccountAndCategory() {
	return client.get('/accounts').then(({ data }) => {
		const accounts = data.accounts;
		log('Found %d accounts for this user', accounts.length);
		const first = accounts[0];
		const payload = {
			accountUid: first.accountUid,
			categoryUid: first.defaultCategory,
			currency: first.currency
		};
		log('Using the first account: %o', payload);
		return payload;
	});
}

function getTransactions(payload) {
	return client.get(
		`/feed/account/${payload.accountUid}/category/${payload.categoryUid}`,
		{ params: { changesSince: config.feedChangesSince } }
	).then(({ data }) => {
		const feedItems = data.feedItems;
		log('Found %d transactions for this account and category', feedItems.length);
		const transactions = feedItems.filter(({ spendingCategory }) => spendingCategory === config.targetSpendingCategory);
		Object.assign(payload, { transactions: transactions });
		return payload;
	});
}

function getSavingsGoal(payload) {
	return client.get(`/account/${payload.accountUid}/savings-goals`).then(({ data }) => {
		const savingsGoals = data.savingsGoalList;
		log('Found %d savings goals', savingsGoals.length);
		const goal = savingsGoals[0];
		const targetGoal = { name: goal.name, savingsGoalUid: goal.savingsGoalUid };
		log('Using the first goal: %o', targetGoal);
		Object.assign(payload, targetGoal);
		return payload;
	});
}

function putIntoSavingsGoal(payload) {
	log('Found %d transactions that match \'%s\', they will be put into the savings goal', payload.transactions.length, config.targetSpendingCategory);
	const batch = payload.transactions.map(transaction => {
		const transferUid = UUID();
		const url = `/account/${payload.accountUid}/savings-goals/${payload.savingsGoalUid}/add-money/${transferUid}`;
		// ToDo: transaction amount multiplier?
		const data = { amount: transaction.amount };
		// return client.put(url, data);
		return new Promise(resolve => {
			dump('Requesting \'put\' on \'%s\' with data: %j', url, data);
			return resolve(data);
		}).then(r => {
			log('Transferred to savings goal: %O', r.amount);
			return r.amount;
		});
	});

	return axios.all(batch).then(results => {
		const total = results.reduce((accumulator, current) => {
			accumulator.minorUnits += current.minorUnits;
			return accumulator;
		});
		log('You have spent \'%o\' in \'%s\' since %s!', { currency: total.currency, amount: total.minorUnits / 100.0 }, config.targetSpendingCategory, config.feedChangesSince);
	});
}

getAccountAndCategory().then(getTransactions).then(getSavingsGoal).then(putIntoSavingsGoal).catch(log);