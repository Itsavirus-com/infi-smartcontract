// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./ChildERC20GaslessUpgradeable.sol";
import "./ChildERC20PowerfulUpgradeable.sol";

contract UChildPowerful is
    UUPSUpgradeable,
    OwnableUpgradeable,
    ChildERC20GaslessUpgradeable,
    ChildERC20PowerfulUpgradeable
{
    function initialize(
        string memory name,
        string memory symbol,
        uint256 cap,
        address trustedForwarder,
        address childChainManager
    ) public initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();

        // __Context_init_unchained();
        __ERC20_init_unchained(name, symbol);
        __EIP712_init_unchained(name, "1");
        __ERC20Permit_init_unchained(name);
        __ERC2771Context_init_unchained(trustedForwarder);
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __ChildERC20Gasless_init_unchained(childChainManager);

        // __Context_init_unchained();
        __ERC20Capped_init_unchained(cap);
        __ERC20Burnable_init_unchained();
        // __ERC20_init_unchained(name, symbol);
        // __ERC165_init_unchained();
        __ERC1363_init_unchained();
        // __AccessControl_init_unchained();
        __SafeTokenRecover_init_unchained();
        __PowerfulChildERC20_init_unchained(0);
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5,05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /**
     * Function that should revert when msg.sender is not authorized to upgrade
     * the contract.
     *
     * Called by upgradeTo and upgradeToAndCall.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {} // solhint-disable-line no-empty-blocks

    /**
     * @dev Function to mint tokens.
     *
     * NOTE: restricting access to addresses with MINTER role. See {ERC20Mintable-mint}.
     *
     * @param account The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function _mint(address account, uint256 amount)
        internal
        virtual
        override(ChildERC20PowerfulUpgradeable, ERC20Upgradeable)
    {
        ChildERC20PowerfulUpgradeable._mint(account, amount);
    }

    /**
     * return the sender of this call.
     * if the call came through our trusted forwarder, return the original sender.
     * otherwise, return `msg.sender`.
     * should be used in the contract anywhere instead of msg.sender
     */
    function _msgSender()
        internal
        view
        virtual
        override(ChildERC20GaslessUpgradeable, ContextUpgradeable)
        returns (address sender)
    {
        return ChildERC20GaslessUpgradeable._msgSender();
    }

    /**
     * return the msg.data of this call.
     * if the call came through our trusted forwarder, then the real sender was appended as the last 20 bytes
     * of the msg.data - so this method will strip those 20 bytes off.
     * otherwise, return `msg.data`
     * should be used in the contract instead of msg.data, where the difference matters (e.g. when explicitly
     * signing or hashing the
     */
    function _msgData()
        internal
        view
        virtual
        override(ChildERC20GaslessUpgradeable, ContextUpgradeable)
        returns (bytes calldata)
    {
        return ChildERC20GaslessUpgradeable._msgData();
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ChildERC20PowerfulUpgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return ChildERC20PowerfulUpgradeable.supportsInterface(interfaceId);
    }
}
