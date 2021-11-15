// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {Master} from "./Master.sol";

contract Encode is Master {
    /**
     * @dev This smart contract used for make an ABI file that will generate typechain, which will be used by Frontend
     */
    bytes32 private constant CREATE_COVER_REQUEST =
        keccak256("CREATE_COVER_REQUEST");
    bytes32 private constant CREATE_COVER_OFFER =
        keccak256("CREATE_COVER_OFFER");

    /**
     * for passing using struct
     */

    function encodeCreateCoverRequestData(CreateCoverRequestData memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function encodeCreateCoverOfferData(CreateCoverOfferData memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function encodeBuyCover(BuyCover memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function encodeProvideCover(ProvideCover memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function addPayloadParamBytes(bytes calldata input)
        external
        pure
        returns (CoinPricingInfo memory feePricing)
    {
        (bytes32 payType, bytes memory payData) = abi.decode(
            input,
            (bytes32, bytes)
        );

        if (payType == CREATE_COVER_REQUEST) {
            CreateCoverRequestData memory payload = abi.decode(
                payData,
                (CreateCoverRequestData)
            );
            return payload.feePricing;
        } else {
            CreateCoverOfferData memory payload = abi.decode(
                payData,
                (CreateCoverOfferData)
            );
            return payload.feePricing;
        }
    }

    function encodeEIP2612Permit(EIP2612Permit memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function decodeEIP2612Permit(bytes calldata data)
        external
        pure
        returns (EIP2612Permit memory)
    {
        return abi.decode(data, (EIP2612Permit));
    }

    function encodeDAIPermit(DAIPermit memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function decodeDAIPermit(bytes calldata data)
        external
        pure
        returns (DAIPermit memory)
    {
        return abi.decode(data, (DAIPermit));
    }
}
