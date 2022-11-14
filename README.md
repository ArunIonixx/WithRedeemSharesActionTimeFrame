# FNDZ Protocol

The FNDZ Protocol is a decentralized copy trading platform, based on Enzyme Finance. Enzyme is an Ethereum-based protocol for decentralized on-chain asset management. It is a protocol for people or entities to manage their wealth & the wealth of others within a customizable and safe environment. Enzyme empowers anyone to set up, manage and invest in customized on-chain investment vehicles.

## Install

### Prerequisites

- [node](https://www.nodejs.org)
- [yarn](https://www.yarnpkg.com)

```sh
git clone [GIT_REPOSITORY_URL]
cd fndz-core
yarn install
```

## Compile contracts

```sh
yarn compile
```

## Test

To run all the tests in parallel:

```sh
yarn test
```

To run an individual test:

```sh
npx hardhat test test/management-fee.test.js
```

## Coverage

Before running the coverage script, please comment out the entire `redeemSharesAndSwap` function of `ComptrollerLib.sol`.
The function is too large, so coverage instrumentation fails.
Tests for this function do not run during coverage testing because they are tagged with `@skip-on-coverage`.

To generate a test coverage report:

```sh
yarn coverage
```

The combined coverage data will be displayed in the `coverage/index.html` file.

To run coverage using only specific test files:
```sh
npx hardhat coverage --testfiles "{test/fndz/comptroller-proxy.test.js,test/fndz/comptroller-lib.test.js}"
```

### Security Issues

If you find a vulnerability that may affect live or testnet deployments, please send your report privately to [security@curvegrid.com](mailto:security@curvegrid.com). Please **DO NOT** file a public issue.
