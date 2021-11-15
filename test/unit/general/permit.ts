import {
  DaiToken,
  Encode,
  Pool,
  UChildDAI,
  UChildUSDC,
} from '@project/contracts/typechain';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { deployments, ethers, network } from 'hardhat';

import { calculateDayInUnix, getNowUnix } from '../utils/calculationUtils';
import { CURRENCY_TYPE } from '../utils/constants';
import { getContract } from '../utils/deployments';
import {
  DAIPermit,
  EIP2612Permit,
  SignerWithAddress,
} from '../utils/interfaces';
import { encodePermit } from '../utils/paramUtils';
import { signPermitDai, signPermitUSDC } from '../utils/signTypedDataUtils';

chai.use(chaiAsPromised);

describe('DAI Permit', () => {
  // Defined variable
  let holder1: SignerWithAddress;
  let coinSigner: SignerWithAddress;
  let encode: Encode;
  let pl: Pool;
  let daiToken: DaiToken | UChildDAI;
  let usdcToken: UChildUSDC;

  const getNonceDAI = (address: string) =>
    (daiToken as UChildDAI).getNonce
      ? (daiToken as UChildDAI).getNonce(address)
      : (daiToken as DaiToken).nonces(address);

  before(async () => {
    await deployments.fixture(['Config', 'Encode', 'MockBalances'], {
      keepExistingDeployments: true,
    });

    // Set time
    await network.provider.send('evm_setNextBlockTimestamp', [getNowUnix()]);

    ({ holder1, coinSigner } = await ethers.getNamedSigners());

    // Get external contracts
    daiToken = await getContract<DaiToken | UChildDAI>('DAI');
    usdcToken = await getContract<UChildUSDC>('USDC');

    // Get fresh contract
    pl = await getContract<Pool>('Pool');
    encode = await getContract<Encode>('Encode');
  });

  describe('DAI Permit Test', async () => {
    it('Coin Signer Address', async () => {
      console.log('Coin Signer Address : ', coinSigner.address);
    });
  });
});
