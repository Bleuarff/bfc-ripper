# BFC-Ripper

A simple CD ripper & encoder GUI, tailored exactly to how I encode my music.

## Install

```shell
npm i
gulp
```
## Usage

````shell
npm start
````

## Dependencies
These tools are not included and must be installed separately. They've been tested against the specified version. Since this software relies on parsing their outputs, there's no guarantee it will work with another version.

cdparanoia 10.2: cd ripper  
flac 1.3.3: flac encoder  
lame 3.100: mp3 encoder  
setcd 1.4: disc drive controller, used to poll if a cd is present
