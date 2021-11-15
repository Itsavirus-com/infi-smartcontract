import { PlatformData } from '@project/contracts/typechain';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { deployments, ethers } from 'hardhat';

import { getContract } from '../utils/deployments';
import { SignerWithAddress } from '../utils/interfaces';

chai.use(chaiAsPromised);
const { expect } = chai;

let pd: PlatformData;
let deployer: SignerWithAddress;

before(async () => {
  await deployments.fixture(['Config'], {
    keepExistingDeployments: true,
  });

  ({ deployer } = await ethers.getNamedSigners());

  // Get fresh contract
  pd = await getContract<PlatformData>('PlatformData');
});

describe('Create Territory', () => {
  it('Add New Platform', async () => {
    const name = 'Binance';
    const website = 'https://www.binance.com/';

    await expect(pd.connect(deployer).addNewPlatform(name, website))
      .to.emit(pd, 'NewPlatform')
      .withArgs(0, name, website);

    const platform = await pd.platforms(0);
    expect(platform.name).to.eq(name);
    expect(platform.website).to.eq(website);
  });

  it('Add New Custodian', async () => {
    const name = 'Binance';
    const website = 'https://www.binance.com/';

    await expect(pd.connect(deployer).addNewCustodian(name, website))
      .to.emit(pd, 'NewCustodian')
      .withArgs(0, name, website);

    const custodian = await pd.custodians(0);
    expect(custodian.name).to.eq(name);
    expect(custodian.website).to.eq(website);
  });

  it('Add New Oracle', async () => {
    const name = 'Chainlink';
    const website = 'https://chain.link/';

    await expect(pd.connect(deployer).addNewOracle(name, website)).to.emit(
      pd,
      'NewOracle'
    );
  });

  it('Add New Price Feed', async () => {
    const symbol = 'uni';
    const oracleId = 3;
    const chainId = 1;
    const decimals = 8;
    const proxyAddress = '0x553303d460EE0afB37EdFf9bE42922D8FF63220e';
    await expect(
      pd
        .connect(deployer)
        .addNewPriceFeed(symbol, oracleId, chainId, decimals, proxyAddress)
    ).to.emit(pd, 'NewPriceFeed');
  });
});
