// From this directory after building: tsc --noEmit --strict --skipLibCheck --module NodeNext storage-options.types.ts
import { type Demos, StorageProgram } from "@demosnetwork/demos-native";

declare const demos: Demos;
StorageProgram.createStorageProgram(
  demos.getAddress(),
  "dacs-vector",
  { hello: "world" },
  "json",
  StorageProgram.publicACL(),
  { nonce: 8 },
);

const address = "example-deployer";
StorageProgram.createStorageProgram(address, "example", {}, undefined, undefined, { nonce: 0 });

// @ts-expect-error Creation requires the options argument containing the nonce.
StorageProgram.createStorageProgram(address, "example", {});
// @ts-expect-error Explicit encoding and ACL do not supply the missing options.
StorageProgram.createStorageProgram(address, "example", {}, "json", StorageProgram.publicACL());
