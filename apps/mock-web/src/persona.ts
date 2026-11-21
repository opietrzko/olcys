/**
 * FIKCYJNA persona scenariusza demonstracyjnego. Wszystkie adresy wygenerowano syntetycznie
 * (scripts/demo-seeds.ts) – są poprawne kryptograficznie, ale nie należą do nikogo.
 * Adresy instytucjonalne (giełdy, kontrakty, zbiórki) to publicznie znane adresy – służą do testu odrzucania.
 */
export const A = {
  ETH_MAIN: '0x1a04d94f740Ec5024E8Fb48b96b9e8792CcD1531',
  /** Adres pojawiający się po „upływie czasu” (stan v2 scenariusza). */
  ETH_NEW: '0x4E825c53fcbB34b40830D46da1838C87c804c6C1',
  ETH_OLD: '0x21A40Dc85741C7bD3b3FffF4872483B82d100fE8',
  /** Adres z ogłoszeń drugiego konta (powiązanego tylko numerem telefonu). */
  ETH_ALIAS: '0xe9B2bC106b21C877DeAE6a0B477a93bA6d16FA0C',
  ETH_TG: '0xB590354d259D3a202B7D8aD7495210a07c8475C2',
  ETH_GIVEAWAY_OWN: '0xE7Ec2108Af92779F3ebD546276EDC2D58fB4C6ed',
  ETH_GIVEAWAY_ORG: '0x363EA387C36b0C1a94fc6B841fc0CbAF4B5859D1',
  ETH_DEPOSIT: '0x70e6f64909DB23c3f4f7804f8BB7CbD9759e1Cc1',
  ETH_HOMONYM: '0xad3A340e8A708bA28D330334B1cffA008B9976Bf',
  ETH_NFT_CONTRACT: '0x24cC5Eae14FB105E15BF35819fF727c70B50346b',
  BTC_MAIN: 'bc1qz9t7kp065ynm2h4d6z5aup3a2yvdsa4up303yg',
  TRON_P2P: 'TURVC3w6WpExTAAggpTV7DbFuURQsJPtrd',
  TRON_OFFRAMP: 'TZ78dT9GqSQrwwF7wMNSn3qQbWdV2ERxHL',
  ETH_P: ['0xF83c67509BcC1fF1d8b22e2fff66DaC89377acfe', '0x86F8C2E4008812EfF738e60A9246b10AEE1F1681', '0x92776958E1fe2cB5e33a96584F02bf3d1A1C0fab', '0x3249509373c2D3Eb258E4dc48bD1760dd5577D97', '0x9EA9F6Ab3A5F5f3e120fcE303823d4C7cC470fc4', '0x6427B19733a37DA2B016d2C5c3C03D2Caf5BE732'],
  TRON_BUYERS: ['TNyNZzRcV5ZgtHPhvydZyFpXPWbAAFqbmy', 'TVEgbFt6GgNFU8xCX6Vv3CPdM3zVRGAEer', 'TPKiJtN7pUCM4HVh2XfPLoMA55gRGLQGzD', 'TQjWLnaXQ8FsPx5JJQHkKh8a4EbzpjSSZA', 'TFvxTyk9Qm16TiPhms54xazB9PeXYn7EKJ', 'TPWRV1oQLWLpH5DJDoFQdH5yy8jL1umV2R'],
  BTC_P: ['bc1qcqgtce9acu3sthqeprqtuphqlg3zczxlwlgwwa', 'bc1qs4lzwzl3c2kpqkfwjtrm696cp9lc2rmg22tk4m', 'bc1qwdeqhymextasqfujczvp9xjdmetdqltcumka4u'],
  // publicznie znane adresy instytucjonalne
  BINANCE_14: '0x28C6c06298d514Db089934071355E5743bf21d60',
  KRAKEN_1: '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2',
  BINANCE_BTC_COLD: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',
  UNISWAP_V2_ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  UNISWAP_V2_USDT_PAIR: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852',
  TORNADO_01: '0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc',
  UKRAINE_ETH: '0x165CD37b4C644C2921454429E7F9358d18A45e14',
  USDT_ETH: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDT_TRON: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
} as const;

export const PERSONA = {
  name: 'Jan Testowy',
  nick: 'krypto_janek',
  email: 'jan.testowy@example.com',
  telegram: 'janek_p2p',
  /** Fikcyjny numer (zakres nieprzydzielany w demo) – łączy konto główne z kontem alias. */
  phone: '600 123 456',
  aliasNick: 'jt_handel',
  website: 'www/jan-testowy',
};

/** Zapis ETH_MAIN zaciemniony spacjami (test deobfuskacji). */
export const obfuscate = (addr: string) => addr.match(/.{1,10}/g)!.join(' ');

/** Stan scenariusza: v1 = stan początkowy, v2 = po zmianie (podmiana adresu w bio + nowy wpis na kanale). */
export const STATE = { version: 1 };
