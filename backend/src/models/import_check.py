import sys
import importlib
import os

try:
    print("Starting dependency check...")
    print(f"Python executable: {sys.executable}")
    print(f"Python version: {sys.version}")
    print(f"Python path: {sys.path}")
    print(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not set')}")

    required_packages = [
        'numpy',
        'torch',
        'tensorflow',
        'opencv-python',
        'onnxruntime',
        'scikit-learn'
    ]

    missing_packages = []

    for package in required_packages:
        try:
            module_name = package.replace('-', '_')
            if module_name == 'opencv_python':
                module_name = 'cv2'
            
            try:
                if module_name == 'scikit_learn':
                    import sklearn
                    module = sklearn
                else:
                    module = importlib.import_module(module_name)
                version = getattr(module, '__version__', 'unknown version')
                print(f"[PASS] {package} ({version})")
            except ImportError as e:
                try:
                    # Try alternate import for scikit-learn
                    if module_name == 'scikit_learn':
                        import sklearn.base
                        version = sklearn.base.__version__
                        print(f"[PASS] {package} ({version})")
                        continue
                except Exception as alt_e:
                    missing_packages.append(package)
                    print(f"[FAIL] {package} - Error: {str(e)}")
                    print(f"Additional debug info: {str(alt_e)}")
        except Exception as e:
            missing_packages.append(package)
            print(f"[FAIL] {package} - Unexpected Error: {str(e)}")

    if missing_packages:
        print("\nMissing required packages. Install them using:")
        print(f"pip install {' '.join(missing_packages)}")
        sys.exit(1)
    else:
        print("\nAll dependencies installed successfully")
        sys.exit(0)

except Exception as e:
    print(f"Error during dependency check: {str(e)}")
    sys.exit(1)