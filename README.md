# chrome-debugging

Chrome DevTools Protocol.

```
npm i chrome-debugging
```

Cache built-in by target id, common helpers, and easy to use.

## Usage
```javascript
const ChromeDebugging = require('chrome-debugging')

const chrome = new ChromeDebugging({ port: 9230 })
const targets = await chrome.list({ ignoreProtocols: ['devtools'] })

for (const target of targets) {
  const tab = await chrome.use(target.id)

  // const { DOM, CSS, Page, Runtime } = tab
  console.log(await tab.$('*'))

  // await tab.close()
}

await chrome.destroy()
```

It uses [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) internally.\
I.e. `tab` has several properties with methods, etc as the original "CDP client".

## License
MIT
