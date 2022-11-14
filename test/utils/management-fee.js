/* eslint-disable @typescript-eslint/no-var-requires */
const { Decimal } = require('decimal.js');
const { BigNumber, utils } = require('ethers');
/* eslint-enable @typescript-eslint/no-var-requires */

// based on enzymefinance/protocol/src/utils/fees/management.ts

const managementFeeDigits = 27;
const managementFeeScale = BigNumber.from(10).pow(managementFeeDigits);
const managementFeeScaleDecimal = new Decimal(managementFeeScale.toString());
const secondsPerYear = 365 * 24 * 60 * 60;

Decimal.set({ precision: 2 * managementFeeDigits });

function convertRateToScaledPerSecondRate(rate) {
  const rateD = new Decimal(utils.formatEther(rate));
  const effectiveRate = rateD.div(new Decimal(1).minus(rateD));

  const factor = new Decimal(1)
    .plus(effectiveRate)
    .pow(1 / secondsPerYear)
    .toSignificantDigits(managementFeeDigits)
    .mul(managementFeeScaleDecimal);

  return BigNumber.from(factor.toFixed(0));
}

function convertScaledPerSecondRateToRate(scaledPerSecondRate) {
  const scaledPerSecondRateD = new Decimal(scaledPerSecondRate.toString()).div(managementFeeScaleDecimal);
  const effectiveRate = scaledPerSecondRateD.pow(secondsPerYear).minus(new Decimal(1));
  const rate = effectiveRate.div(new Decimal(1).plus(effectiveRate));

  return utils.parseEther(rate.toFixed(17, Decimal.ROUND_UP));
}

function rpow(x, n, b) {
  const xD = new Decimal(BigNumber.from(x).toString());
  const bD = new Decimal(BigNumber.from(b).toString());
  const nD = new Decimal(BigNumber.from(n).toString());

  const xDPow = xD.div(bD).pow(nD);

  return BigNumber.from(xDPow.mul(bD).toFixed(0));
}

function managementFeeSharesDue(scaledPerSecondRate, sharesSupply, secondsSinceLastSettled) {
  const timeFactor = rpow(scaledPerSecondRate, secondsSinceLastSettled, managementFeeScale);

  const sharesDue = BigNumber.from(sharesSupply).mul(timeFactor.sub(managementFeeScale)).div(managementFeeScale);

  return sharesDue;
}

module.exports = {
  convertRateToScaledPerSecondRate,
  convertScaledPerSecondRateToRate,
  managementFeeSharesDue,
};
