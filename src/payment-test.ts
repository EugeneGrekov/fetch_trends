#!/usr/bin/env node
import { runPaymentTestCli } from './commands/payment-test.js';

await runPaymentTestCli(process.argv);
