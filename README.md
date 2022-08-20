# chrome-debugging

Chrome DevTools Protocol.

```
npm i chrome-debugging
```

It uses [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) internally.

## Usage
```javascript
const ChromeDebugging = require('chrome-debugging')

const chrome = new ChromeDebugging({ port: 9230 })
const targets = await chrome.list({ ignoreProtocols: ['devtools'] })

for (const target of targets) {
  const tab = await chrome.connect(target.id)

  const document = await tab.DOM.getDocument()
  const $ = (selector) => DOM.querySelectorAll({ nodeId: document.root.nodeId, selector })

  console.log(await $('div'))
}

await chrome.destroy()
```

## License
MIT
