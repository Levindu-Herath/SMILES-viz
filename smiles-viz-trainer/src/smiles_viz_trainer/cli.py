import os

_conda_prefix = os.environ.get("CONDA_PREFIX", "")
if _conda_prefix:
    for _dll_dir in [
        os.path.join(_conda_prefix, "Library", "bin"),
        os.path.join(_conda_prefix, "Library", "lib"),
        os.path.join(_conda_prefix, "DLLs"),
    ]:
        if os.path.isdir(_dll_dir):
            os.add_dll_directory(_dll_dir)

import click
import uvicorn


@click.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Host to bind the server to.")
@click.option("--port", default=5000, show_default=True, help="Port to bind the server to.")
def main(host: str, port: int):
    """Start the smiles-viz-trainer local server."""
    click.echo(f"Starting smiles-viz-trainer server at http://{host}:{port}")
    uvicorn.run("smiles_viz_trainer.server.app:create_app", host=host, port=port, factory=True)


if __name__ == "__main__":
    main()
