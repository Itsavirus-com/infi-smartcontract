import { artifacts, ethers } from 'hardhat';
// import { Signing__factory, Signing } from "@project/contracts/typechain";

type Awaited<T> = T extends PromiseLike<infer U> ? U : T;

const AUTH_QUOTE_ENGINE_ADDR =
  process.env.AUTH_QUOTE_ENGINE_ADDR ||
  '0x51042c4d8936a7764d18370a6a0762b860bb8e07';

export type Contracts = Awaited<ReturnType<typeof setup>>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function setupContracts() {
  const [deployer] = await ethers.getSigners();

  // Deploy Contracts
  // const signingFactory = new Signing__factory(deployer)
  // const signing = await signingFactory.deploy(AUTH_QUOTE_ENGINE_ADDR);

  return {
    // signing
  } as const;
}

export type Fixtures = Awaited<ReturnType<typeof setup>>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function setup() {
  return {
    contracts: await setupContracts(),
  } as const;
}
