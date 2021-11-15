import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

// import { artifacts, ethers } from 'hardhat';
import { Fixtures, setup } from './fixtures';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('Signing Price', () => {
  let fixtures: Fixtures;

  before(async () => {
    fixtures = await setup();
  });

  beforeEach(async () => {});

  xit('First Integration Test', async () => {
    // const { signing } = fixtures.contracts;
  });
});
