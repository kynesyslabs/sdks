// Jest lets a spec call process.exit, which ends the whole run. With exit code
// 0 (as in the specs that bail out when FUNDED_MNEMONIC is unset) that is a
// green check with tests missing, so in the offline run it fails the spec.
process.exit = ((code?: number | string) => {
	throw new Error(`process.exit(${code ?? ''}) was called by a spec; the offline run does not allow it`);
}) as typeof process.exit;
