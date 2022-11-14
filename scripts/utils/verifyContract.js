/* eslint-disable @typescript-eslint/no-var-requires */
const hardhat = require('hardhat');

const verifyContract = async (address, constructorArguments) => {
  return hardhat.run('verify:verify', {
    address,
    constructorArguments,
  });
};

module.exports = { verifyContract };
