#! /bin/bash

# Infer the path to the script
current_dir=$(pwd)
script_path=$(dirname $(realpath $0))
cd $script_path

# First run the setup
setup () {
    # We need python 3.10 or higher and pip
    python_version=$(python3 --version | awk '{print $2}' | cut -d. -f1-2)
    last_digits=$(echo $python_version | cut -d. -f2)
    if [ "$last_digits" -lt "10" ]; then
        echo "Python 3.10 or higher is required"
        exit 1
    fi
    if ! command -v pip &> /dev/null; then
        echo "pip is required"
        exit 1
    fi
    # Install the dependencies
    echo "Installing dependencies"
    pip install -r requirements.txt || exit 1

    # Create a file to indicate that the environment is setup
    echo "Environment setup complete"
    echo "done" > .setup_done
}


setup_done=".setup_done"
done_flag=false
if [ -f "$setup_done" ]; then
    if [ "$(cat $setup_done)" == "done" ]; then
        echo "Environment already setup"
        done_flag=true
    fi
fi

if [ "$done_flag" = false ]; then
    setup
fi

# Launch the app
echo "Launching the app"
python main.py || exit 1

cd $current_dir