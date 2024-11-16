import os
import pickle
import sys


def create_credential(client, rp, user, challenge):
    # Create a random challenge
    challenge = os.urandom(16)
    # Create a credential with a HmacSecret
    result = client.make_credential(
        {
            "rp": rp,
            "user": user,
            "challenge": challenge,
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
            "extensions": {"hmacCreateSecret": True},
        },
    )

    # HmacSecret result:
    if not result.extension_results.get("hmacCreateSecret"):
        print("Failed to create credential with HmacSecret")
        sys.exit(1)

    credential = result.attestation_object.auth_data.credential_data
    print("New credential created, with the HmacSecret extension.")
    # Saving credential to file with pickle
    with open("data/credential.pkl", "wb") as f:
        pickle.dump(credential, f)
    return credential


def load_credential():
    try:
        with open("data/credential.pkl", "rb") as f:
            print("Loading credential from file")
            return pickle.load(f)
    except FileNotFoundError:
        print("No credential found, creating new one")
        return None
    except Exception as e:
        print("Failed to load credential from file:", e)
        return None
