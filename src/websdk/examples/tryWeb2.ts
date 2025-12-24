import { DemosWebAuth } from "../DemosWebAuth"
import { Demos } from "../demosclass"

async function tryWeb2Proxy() {
    try {
        const demos = new Demos()
        await demos.connect("https://node2.demos.sh")
        const identity = DemosWebAuth.getInstance()
        await identity.create()
        await demos.connectWallet(identity.keypair.privateKey as Buffer)

        const dahr = await demos.web2.createDahr()

        // 1) GET with custom headers (including array header)
        const resp1 = await dahr.startProxy({
            url: "https://postman-echo.com/get?tags=dev&tags=api&test=1",
            method: "GET",
            options: {
                headers: {
                    "X-Test": "sdk-get",
                    Accept: ["application/json", "text/plain"], // will be joined by proxy
                    Authorization: "Bearer test-token-1", // sent via headers unconditionally
                },
                authorization: "test-token-ignored-in-dev", // used only if server-side requires it
            },
        })

        // 2) POST with JSON payload + headers
        const resp2 = await dahr.startProxy({
            url: "https://postman-echo.com/post",
            method: "POST",
            options: {
                headers: {
                    "Content-Type": "application/json",
                    "X-Trace-Id": "abc123",
                    Authorization: "Bearer test-token-2",
                },
                payload: {
                    user: { id: 1, name: "alice" },
                    tags: ["web2", "sdk"],
                },
            },
        })

        // 3) PUT with payload
        const resp3 = await dahr.startProxy({
            url: "https://jsonplaceholder.typicode.com/posts/1",
            method: "PUT",
            options: {
                headers: {
                    "Content-Type": "application/json",
                    "X-Op": "put",
                },
                payload: {
                    id: 1,
                    title: "foo",
                    body: "bar",
                    userId: 1,
                },
            },
        })

        // 4) PATCH with payload
        const resp4 = await dahr.startProxy({
            url: "https://dummyjson.com/products/1",
            method: "PATCH",
            options: {
                headers: {
                    "Content-Type": "application/json",
                    "X-Op": "patch",
                },
                payload: { price: 199.99 },
            },
        })

        console.log("GET resp:", resp1)
        console.log("POST resp:", resp2)
        console.log("PUT resp:", resp3)
        console.log("PATCH resp:", resp4)
    } catch (error) {
        console.error("Error:", error)
    }
}

tryWeb2Proxy()
