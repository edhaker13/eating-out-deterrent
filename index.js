const debug = require('debug');
const axios = require('axios');
const UUID = require('uuid/v4')

const log = debug('eating-out-deterrent');
const dump = log.extend('DUMP');

const accessToken = process.env.accessToken;
const client = axios.create({
	baseURL: 'https://api.starlingbank.com/api/v2/',
	headers: {
		Accept: 'application/json',
		Authorization: `Bearer ${accessToken}`,
		'Content-Type': 'application/json'
	}
});

function getAccountAndCategory() {
	return client.get('/accounts').then(({ data }) => {
		dump('Accounts: %j', data);
		const accounts = data.accounts;
		log('Found %d accounts for this user', accounts.length);
		const first = accounts[0];
		const config = {
			accountUid: first.accountUid,
			categoryUid: first.defaultCategory,
			currency: first.currency
		};
		log('Using the first account: %O', config);
		return config;
	});
}

function getTransactions(config) {
	// ToDo: variable changesSince
	return client.get(`/feed/account/${config.accountUid}/category/${config.categoryUid}`,
		{ params: { changesSince: '2019-05-01T00:00:00.000Z' } }).then(({ data }) => {
			const feedItems = data.feedItems;
			log('Found %d transactions for this account and category', feedItems.length);
			const transactions = feedItems.filter(({ spendingCategory }) => spendingCategory === 'EATING_OUT');
			Object.assign(config, { transactions: transactions });
			return config;
		});
}

function getSavingsGoal(config) {
	return client.get(`/account/${config.accountUid}/savings-goals`).then(({ data }) => {
		dump('Savings-Goals: %j', data);
		const savingsGoals = data.savingsGoalList;
		log('Found %d savings goals', savingsGoals.length);
		const goal = savingsGoals[0];
		log('Using the first goal: %O', goal);
		Object.assign(config, { savingsGoalUid: goal.savingsGoalUid });
		return config;
	});
}

function putIntoSavingsGoal(config) {
	log('Found %d transactions that will be put into savings', config.transactions.length);
	for (let transaction of config.transactions) {
		const amount = transaction.amount;
		log('Sending transaction from %s to %s: %O', transaction.feedItemUid, config.savingsGoalUid, amount);
		// ToDo: transaction amount multiplier?
		const data = { amount: amount };
		dump('put-add-money: %j', data);
		const transferUid = UUID();
		//client.put(`/account/${config.accountUid}/savings-goals/${config.savingsGoalUid}/add-money/${transferUid}`, data);
		log(`Sent ${amount} with id ${transferUid}`);
	}
	// ToDo: batch the requests and return promise
	//return axios.all();
}

getAccountAndCategory().then(getSavingsGoal).then(getTransactions).then(putIntoSavingsGoal).catch(log);