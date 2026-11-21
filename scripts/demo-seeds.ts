import { synthetic, validateAddress } from '@olcys/core';
const seeds: Record<string, string> = {
  ETH_MAIN: synthetic.eth('olcys-demo:janek:eth-main'),
  ETH_OLD: synthetic.eth('olcys-demo:janek:eth-old'),
  ETH_TG: synthetic.eth('olcys-demo:janek:eth-telegram'),
  ETH_GIVEAWAY_OWN: synthetic.eth('olcys-demo:janek:eth-giveaway'),
  ETH_GIVEAWAY_ORG: synthetic.eth('olcys-demo:giveaway-organizer'),
  ETH_DEPOSIT: synthetic.eth('olcys-demo:cex-deposit-1'),
  ETH_HOMONYM: synthetic.eth('olcys-demo:homonym:eth'),
  BTC_MAIN: synthetic.btcBech32('olcys-demo:janek:btc-main'),
  TRON_P2P: synthetic.tron('olcys-demo:janek:tron-p2p'),
  TRON_OFFRAMP: synthetic.tron('olcys-demo:fikcyjny-kantor'),
};
for (let i = 1; i <= 6; i++) seeds[`ETH_P${i}`] = synthetic.eth(`olcys-demo:counterparty:${i}`);
for (let i = 1; i <= 6; i++) seeds[`TRON_BUYER${i}`] = synthetic.tron(`olcys-demo:p2p-buyer:${i}`);
for (let i = 1; i <= 3; i++) seeds[`BTC_P${i}`] = synthetic.btcBech32(`olcys-demo:btc-counterparty:${i}`);
for (const [k, v] of Object.entries(seeds)) console.log(k.padEnd(18), v, validateAddress(v).valid);
// znane adresy publiczne – kontrola sum kontrolnych
for (const a of ['0x28C6c06298d514Db089934071355E5743bf21d60','0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2','0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D','0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc','0xdAC17F958D2ee523a2206206994597C13D831ec7','0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48','0x165CD37b4C644C2921454429E7F9358d18A45e14','34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo','357a3So9CbsNfBBgFYACGvxxS6tMaDoa1P','0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD','TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t','bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'])
  console.log('KNOWN', a, JSON.stringify(validateAddress(a)));
