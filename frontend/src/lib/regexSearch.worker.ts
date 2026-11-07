import { executeRegex, type RegexRequest } from './regexSearch'
self.onmessage = (event: MessageEvent<RegexRequest>) => { self.postMessage(executeRegex(event.data)) }
