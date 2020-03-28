# test-rust-docs-ui

## How to add tests

You'll need to add two files for a test: a `.gom` and a `.rs` (which represents a file that'll be documented with rustdoc).

The `.gom` contains the instructions that the browser will execute. You can see the list of available commands [here](https://github.com/GuillaumeGomez/browser-UI-test/blob/master/README.md).

## Run tests

We now prefer to run those tests through docker based on this [docker hub image](https://hub.docker.com/repository/docker/gomezguillaume/browser-ui-test/general). The list of the available versions is [here](https://hub.docker.com/r/gomezguillaume/browser-ui-test/tags). Take the latest if you don't care or a specific day if you're looking for a specific one.

```bash
# latest can be replaced with 2020-03-28 for example
$ docker pull gomezguillaume/browser-ui-test:latest
$ docker run \
    -v "$PWD:/data" \
    -u $(id -u ${USER}):$(id -g ${USER}) \
    gomezguillaume/browser-ui-test:latest \
    # browser-ui-test options from this point
    --test-folder /data/ui-tests \
    --failure-folder /data/failures/ \
    --variable DOC_PATH /data/test-docs/target/doc/test_docs \
    --show-text \
    --generate-images
```
