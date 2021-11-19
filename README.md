# Typescript Solidity Dev Starter Kit

_Updated to use Hardhat!_

This is a starter kit for developing, testing, and deploying smart contracts with a full Typescript environment. This stack uses [Hardhat](https://hardhat.org) as the platform layer to orchestrate all the tasks. [Ethers](https://docs.ethers.io/v5/) is used for all Ethereum interactions and testing.

[Blog Post](https://medium.com/@rahulsethuram/the-new-solidity-dev-stack-buidler-ethers-waffle-typescript-tutorial-f07917de48ae)

## Using this Project

Clone this repository, then install the dependencies with `npm install`. Build everything with `npm run build`. https://hardhat.org has excellent docs, and can be used as reference for extending this project.

## Available Functionality

### Build Contracts and Generate Typechain Typeings

`npm run compile`

### Run Contract Tests & Get Callstacks

In one terminal run `npx hardhat node`

Then in another run `npm run test`

Notes:

- As is, the tests fail on purpose. This is to show the Solidity stack traces that Buidler enables!
- The gas usage table may be incomplete (the gas report currently needs to run with the `--network localhost` flag; see below).

### Run Contract Tests and Generate Gas Usage Report

In one terminal run `npx hardhat node`

Then in another run `npm run test -- --network localhost`

Notes:

- When running with this `localhost` option, you get a gas report but may not get good callstacks
- See [here](https://github.com/cgewecke/eth-gas-reporter#installation-and-config) for how to configure the gas usage report.

### Run Coverage Report for Tests

`npm run coverage`

Notes:

- running a coverage report currently deletes artifacts, so after each coverage run you will then need to run `npx buidler clean` followed by `npm run build` before re-running tests
- the branch coverage is 75%

### Deploy to Ethereum

Create/modify network config in `hardhat.config.ts` and add API key and private key, then run:

`npx hardhat run --network rinkeby scripts/deploy.ts`

### Verify on Etherscan

Using the [hardhat-etherscan plugin](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html), add Etherscan API key to `hardhat.config.ts`, then run:

`npx hardhat verify --network rinkeby <DEPLOYED ADDRESS>`

PRs and feedback welcome!

### Error Message Code on Smart Contract

- ERR_AUTH_1 = Caller is not access control admin
- ERR_AUTH_2 = Caller is not from allowed address
- ERR_AUTH_3 = Caller is not wallet dev address
- ERR_AUTH_4 = Member balance insufficient
- ERR_AUTH_5 = Caller is not proxy admin

- ERR_SIGN_NOT_VALID = Signature not valid

- ERR_CLG_1 = Caller is not cover owner
- ERR_CLG_2 = Cover not started yet
- ERR_CLG_3 = Cover is not active
- ERR_CLG_4 = Valid claims exist
- ERR_CLG_5 = Cannot claim using same round id / Round id already used in came cover
- ERR_CLG_6 = Invalid timestamp of round id
- ERR_CLG_7 = Previous round not devaluation / 1 hour before selected riunf_id is not devaluation
- ERR_CLG_8 = Not passing monitoring period
- ERR_CLG_9 = Already passing payout period
- ERR_CLG_10 = Insufficients fund to payout the claims
- ERR_CLG_11 = Invalid cover/ Cover type must REQUEST
- ERR_CLG_12 = Callee is not funder of cover
- ERR_CLG_13 = Premium already collected
- ERR_CLG_14 = Caller is not owner of cover request
- ERR_CLG_15 = Premium already refunded
- ERR_CLG_16 = Cannot refund premium right now
- ERR_CLG_17 = There are nothing to refund
- ERR_CLG_18 = Caller is not owner of cover offer
- ERR_CLG_19 = Not passing lockup period
- ERR_CLG_20 = There is any active cover
- ERR_CLG_21 = Pending claims exists
- ERR_CLG_22 = Deposit already taken back/ already refunded
- ERR_CLG_23 = Expired pending claims are exist
- ERR_CLG_24 = There is no deposit left
- ERR_CLG_25 = Cannot refund deposit right now
- ERR_CLG_25 = Cannot process unsuccessfull request
- ERR_CLG_26 = Claim already checked / claim not in monitoring state
- ERR_CLG_27 = Invalid cover/ Cover type must OFFER
- ERR_CLG_28 = Wrong Format Cover QTY
- ERR_CLG_29 = Total premium must bigger than 0

- ERR_CG_1 = Cannot take own listing
- ERR_CG_2 = Listing has expired
- ERR_CG_3 = Invalid cover months
- ERR_CG_4 = Insufficient remaining insured sum
- ERR_CG_5 = Invalid insured sum
- ERR_CG_6 = Must take full insured sum / this is a full listing, thean cannot take it partially
- ERR_CG_7 = Request has started
- ERR_CG_8 = Not passing minimum deposit / Minimal Deposit $1000

- ERR_LG_1 = Caller is not listing owner
- ERR_LG_2 = Cover period out of bound
- ERR_LG_3 = Invalid expired at attribute/value
- ERR_LG_4 = Insufficient transfered fee
- ERR_LG_5 = Not passing minimum deposit / Minimal Deposit $1000

- ERR_CHNLNK_1 = Round not complete
- ERR_CHNLNK_2 = Not valid currency index

- ERR_FC_1 = Address still in buffer time
