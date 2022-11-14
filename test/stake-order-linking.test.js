/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
/* eslint-enable @typescript-eslint/no-var-requires */

let accounts;
let deployer;
let sol;

const addresses = [
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000004',
];

beforeEach(async function () {
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const StakeOrderLinking = await ethers.getContractFactory('MockStakeOrderLinking', deployer);
  sol = await StakeOrderLinking.deploy();
});

describe('StakeOrderLinking Test Suite', function () {
  describe('addToStakeOrderLink()', function () {
    it('should add address in proper order', async () => {
      await sol.addToStakeOrderLink(addresses[1]);
      expect(await sol.firstStakeholder()).to.equal(addresses[1]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[1])).to.deep.equal([addresses[0], addresses[0]]);
      expect(await sol.lastStakeholder()).to.equal(addresses[1]);

      await sol.addToStakeOrderLink(addresses[2]);
      expect(await sol.firstStakeholder()).to.equal(addresses[1]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[1])).to.deep.equal([addresses[0], addresses[2]]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[2])).to.deep.equal([addresses[1], addresses[0]]);
      expect(await sol.lastStakeholder()).to.equal(addresses[2]);

      await sol.addToStakeOrderLink(addresses[3]);
      expect(await sol.firstStakeholder()).to.equal(addresses[1]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[1])).to.deep.equal([addresses[0], addresses[2]]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[2])).to.deep.equal([addresses[1], addresses[3]]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[3])).to.deep.equal([addresses[2], addresses[0]]);
      expect(await sol.lastStakeholder()).to.equal(addresses[3]);
    });

    it('should not add the zero address', async () => {
      await expect(sol.addToStakeOrderLink(addresses[0])).to.revertedWith('Address should not be a zero address');
    });

    it('should not add the address which is already present in the link', async () => {
      await sol.addToStakeOrderLink(addresses[1]);
      await expect(sol.addToStakeOrderLink(addresses[1])).to.revertedWith(
        'stakeholder address already present in the link',
      );
    });
  });

  describe('removeFromStakeOrderLink()', function () {
    it('should remove the address from the link', async () => {
      await sol.addToStakeOrderLink(addresses[1]);
      await sol.addToStakeOrderLink(addresses[2]);
      await sol.addToStakeOrderLink(addresses[3]);
      await sol.addToStakeOrderLink(addresses[4]);
      // 1 <-> 2 <-> 3 <-> 4

      // remove at the first
      // The link should be "2 <-> 3 <-> 4"
      await sol.removeFromStakeOrderLink(addresses[1]);
      expect(await sol.firstStakeholder()).to.equal(addresses[2]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[2])).to.deep.equal([addresses[0], addresses[3]]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[3])).to.deep.equal([addresses[2], addresses[4]]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[4])).to.deep.equal([addresses[3], addresses[0]]);
      expect(await sol.lastStakeholder()).to.equal(addresses[4]);

      // remove at the middle
      // The link should be "2 <-> 4"
      await sol.removeFromStakeOrderLink(addresses[3]);
      expect(await sol.firstStakeholder()).to.equal(addresses[2]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[2])).to.deep.equal([addresses[0], addresses[4]]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[4])).to.deep.equal([addresses[2], addresses[0]]);
      expect(await sol.lastStakeholder()).to.equal(addresses[4]);

      // remove at the end
      // The link should be "2"
      await sol.removeFromStakeOrderLink(addresses[4]);
      expect(await sol.firstStakeholder()).to.equal(addresses[2]);
      expect(await sol.stakeholderToStakeOrderLink(addresses[2])).to.deep.equal([addresses[0], addresses[0]]);
      expect(await sol.lastStakeholder()).to.equal(addresses[2]);

      // remove the remaining
      // The link should be ""
      await sol.removeFromStakeOrderLink(addresses[2]);
      expect(await sol.firstStakeholder()).to.equal(addresses[0]);
      expect(await sol.lastStakeholder()).to.equal(addresses[0]);
    });

    it('should not remove the zero address', async () => {
      await expect(sol.removeFromStakeOrderLink(addresses[0])).to.revertedWith('Address should not be a zero address');
    });

    it('should not remove the address which is not present in the link', async () => {
      await expect(sol.removeFromStakeOrderLink(addresses[3])).to.revertedWith(
        'stakeholder address not present in the link',
      );
    });
  });
});
