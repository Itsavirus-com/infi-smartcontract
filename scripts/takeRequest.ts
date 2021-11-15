import {
  CoverGateway,
  Encode,
  Pool,
  UChildDAI,
} from '@project/contracts/typechain';
import { BigNumber, Contract, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';

import { calculateDayInUnix } from '../test/unit/utils/calculationUtils';
import { CURRENCY_TYPE } from '../test/unit/utils/constants';
import {
  CoinPricingInfoUnsigned,
  DAIPermit,
  ProvideCover,
  SignerWithAddress,
} from '../test/unit/utils/interfaces';
import { encodePermit } from '../test/unit/utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
} from '../test/unit/utils/signTypedDataUtils';

// Template
const dataCoinDAI: CoinPricingInfoUnsigned = {
  coinId: 'dai',
  coinSymbol: 'DAI',
  lastUpdatedAt: 1622604081,
  coinPrice: ethers.utils.parseUnits('1', 6),
};
/**
 * Interface
 */
interface ProvideCoverData {
  requestCoverId: number;
  funder: SignerWithAddress;
  fundingSum: BigNumber;
  daiToken: UChildDAI;
  coinSigner: SignerWithAddress;
  pool: Pool;
  encode: Encode;
  coverGateway: CoverGateway;
}
async function getContract<T extends Contract>(
  name: string,
  signer?: string | Signer
): Promise<T> {
  const proxy1 =
    (await deployments.getOrNull(`UChildERC20Proxy${name}`)) ||
    (await deployments.getOrNull(`UChildERC20Proxy${name}Dummy`));

  const proxy2 = await deployments.getOrNull(`FiatTokenProxy${name}`);

  if (proxy1) {
    return (await ethers.getContract<T>(`UChild${name}`, signer)).attach(
      proxy1.address
    ) as T;
  } else if (proxy2) {
    return (await ethers.getContract<T>(`FiatToken${name}`, signer)).attach(
      proxy2.address
    ) as T;
  } else {
    return ethers.getContract<T>(name, signer);
  }
}

/**
 * @dev Function for Provide Cover
 * */
async function provideCoverWithDAI(param: ProvideCoverData) {
  const {
    requestCoverId,
    funder,
    fundingSum,
    daiToken,
    coinSigner,
    pool,
    encode,
    coverGateway,
  } = param;
  // Create permit for DAI
  const blockNow = (await ethers.provider.getBlock('latest')).timestamp;
  const nonce = await daiToken.getNonce(funder.address);
  const signPermitDaiData: DAIPermit = await signPermitDai(
    funder,
    pool.address,
    nonce.toNumber(),
    blockNow + calculateDayInUnix(1)
  );
  const permitDataBytes: string = encodePermit(
    CURRENCY_TYPE.DAI,
    signPermitDaiData,
    encode
  );
  // Prepare Data
  const provideCoverData: ProvideCover = {
    requestId: requestCoverId,
    provider: funder.address,
    fundingSum,
    assetPricing: await signCoinPricingInfo(
      dataCoinDAI,
      coinSigner,
      pool.address
    ), // verify by Cover Gateway
    assetPermit: permitDataBytes,
  };

  // Send transaction
  await coverGateway.connect(funder).provideCover(provideCoverData);
}

async function main() {
  const daiToken = await getContract<UChildDAI>('DAI');
  const pool = await getContract<Pool>('Pool');
  const encode = await getContract<Encode>('Encode');
  const coverGateway = await getContract<CoverGateway>('CoverGateway');
  const daiDecimal = await daiToken.decimals();
  const { coinSigner, funder1, funder2 } = await ethers.getNamedSigners();
  const defaultParameter: ProvideCoverData = {
    requestCoverId: 0,
    funder: funder1,
    fundingSum: ethers.utils.parseUnits('0'),
    daiToken,
    coinSigner,
    pool,
    encode,
    coverGateway,
  };

  // First Take Request for Request Cover 0
  await provideCoverWithDAI({
    ...defaultParameter,
    requestCoverId: 0,
    funder: funder1,
    fundingSum: ethers.utils.parseUnits('100', daiDecimal),
  });

  // Second Take Request for Request Cover 0 and start cover
  await provideCoverWithDAI({
    ...defaultParameter,
    requestCoverId: 0,
    funder: funder2,
    fundingSum: ethers.utils.parseUnits('1627', daiDecimal),
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
