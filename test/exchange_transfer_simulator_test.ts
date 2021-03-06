import * as chai from 'chai';
import * as BigNumber from 'bignumber.js';
import {chaiSetup} from './utils/chai_setup';
import {web3Factory} from './utils/web3_factory';
import {ZeroEx, ExchangeContractErrs, Token} from '../src';
import {TradeSide, TransferType} from '../src/types';
import {BlockchainLifecycle} from './utils/blockchain_lifecycle';
import {ExchangeTransferSimulator} from '../src/utils/exchange_transfer_simulator';

chaiSetup.configure();
const expect = chai.expect;
const blockchainLifecycle = new BlockchainLifecycle();

describe('ExchangeTransferSimulator', () => {
    const web3 = web3Factory.create();
    const zeroEx = new ZeroEx(web3.currentProvider);
    const transferAmount = new BigNumber(5);
    let userAddresses: string[];
    let tokens: Token[];
    let coinbase: string;
    let sender: string;
    let recipient: string;
    let exampleTokenAddress: string;
    let exchangeTransferSimulator: ExchangeTransferSimulator;
    let txHash: string;
    before(async () => {
        userAddresses = await zeroEx.getAvailableAddressesAsync();
        [coinbase, sender, recipient] = userAddresses;
        tokens = await zeroEx.tokenRegistry.getTokensAsync();
        exampleTokenAddress = tokens[0].address;
    });
    beforeEach(async () => {
        await blockchainLifecycle.startAsync();
    });
    afterEach(async () => {
        await blockchainLifecycle.revertAsync();
    });
    describe('#transferFromAsync', () => {
        beforeEach(() => {
            exchangeTransferSimulator = new ExchangeTransferSimulator(zeroEx.token);
        });
        it('throws if the user doesn\'t have enough allowance', async () => {
            return expect(exchangeTransferSimulator.transferFromAsync(
                exampleTokenAddress, sender, recipient, transferAmount, TradeSide.Taker, TransferType.Trade,
            )).to.be.rejectedWith(ExchangeContractErrs.InsufficientTakerAllowance);
        });
        it('throws if the user doesn\'t have enough balance', async () => {
            txHash = await zeroEx.token.setProxyAllowanceAsync(exampleTokenAddress, sender, transferAmount);
            await zeroEx.awaitTransactionMinedAsync(txHash);
            return expect(exchangeTransferSimulator.transferFromAsync(
                exampleTokenAddress, sender, recipient, transferAmount, TradeSide.Maker, TransferType.Trade,
            )).to.be.rejectedWith(ExchangeContractErrs.InsufficientMakerBalance);
        });
        it('updates balances and proxyAllowance after transfer', async () => {
            txHash = await zeroEx.token.transferAsync(exampleTokenAddress, coinbase, sender, transferAmount);
            await zeroEx.awaitTransactionMinedAsync(txHash);
            txHash = await zeroEx.token.setProxyAllowanceAsync(exampleTokenAddress, sender, transferAmount);
            await zeroEx.awaitTransactionMinedAsync(txHash);
            await exchangeTransferSimulator.transferFromAsync(
                exampleTokenAddress, sender, recipient, transferAmount, TradeSide.Taker, TransferType.Trade,
            );
            const senderBalance = await (exchangeTransferSimulator as any).getBalanceAsync(exampleTokenAddress, sender);
            const recipientBalance = await (exchangeTransferSimulator as any).getBalanceAsync(
                exampleTokenAddress, recipient);
            const senderProxyAllowance = await (exchangeTransferSimulator as any).getProxyAllowanceAsync(
                exampleTokenAddress, sender);
            expect(senderBalance).to.be.bignumber.equal(0);
            expect(recipientBalance).to.be.bignumber.equal(transferAmount);
            expect(senderProxyAllowance).to.be.bignumber.equal(0);
        });
        it('doesn\'t update proxyAllowance after transfer if unlimited', async () => {
            txHash = await zeroEx.token.transferAsync(exampleTokenAddress, coinbase, sender, transferAmount);
            await zeroEx.awaitTransactionMinedAsync(txHash);
            txHash = await zeroEx.token.setUnlimitedProxyAllowanceAsync(exampleTokenAddress, sender);
            await zeroEx.awaitTransactionMinedAsync(txHash);
            await exchangeTransferSimulator.transferFromAsync(
                exampleTokenAddress, sender, recipient, transferAmount, TradeSide.Taker, TransferType.Trade,
            );
            const senderBalance = await (exchangeTransferSimulator as any).getBalanceAsync(exampleTokenAddress, sender);
            const recipientBalance = await (exchangeTransferSimulator as any).getBalanceAsync(
                exampleTokenAddress, recipient);
            const senderProxyAllowance = await (exchangeTransferSimulator as any).getProxyAllowanceAsync(
                exampleTokenAddress, sender);
            expect(senderBalance).to.be.bignumber.equal(0);
            expect(recipientBalance).to.be.bignumber.equal(transferAmount);
            expect(senderProxyAllowance).to.be.bignumber.equal(zeroEx.token.UNLIMITED_ALLOWANCE_IN_BASE_UNITS);
        });
    });
});
