// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MockEUR
 * @notice Simulirani ERC-20 token koji predstavlja euro u prototipu.
 *
 * Token nema stvarnu novčanu vrijednost i koristi se isključivo
 * za demonstraciju kupoprodaje nekretnina pomoću pametnih ugovora.
 */
contract MockEUR is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("Mock Euro", "mEUR") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    /**
     * @notice Token koristi dvije decimale, poput iznosa u eurima i centima.
     */
    function decimals() public pure override returns (uint8) {
        return 2;
    }

    /**
     * @notice Stvara nove mEUR tokene i dodjeljuje ih određenoj adresi.
     *
     * Funkciju može pozvati samo korisnik s MINTER_ROLE ulogom.
     *
     * @param recipient Adresa primatelja tokena.
     * @param amount Količina tokena izražena u najmanjim jedinicama.
     */
    function mint(
        address recipient,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        require(
            recipient != address(0),
            "Adresa primatelja nije valjana"
        );

        require(
            amount > 0,
            "Kolicina mora biti veca od nule"
        );

        _mint(recipient, amount);
    }
}