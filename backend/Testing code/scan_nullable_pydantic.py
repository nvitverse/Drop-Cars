import os
import ast
import inspect
from pydantic import BaseModel
from typing import get_type_hints, Union

def scan_pydantic_schemas():
    schemas_dir = r"C:\Users\Administrator\Desktop\dropcars-review\backend\app\schemas"
    print("==========================================================================")
    print("          PYDANTIC NULLABLE COLUMN SAFETY AUDIT SCANNER")
    print("==========================================================================")
    
    issues = []
    for root, _, files in os.walk(schemas_dir):
        for f in files:
            if f.endswith(".py") and not f.startswith("__"):
                filepath = os.path.join(root, f)
                with open(filepath, "r", encoding="utf-8") as file:
                    content = file.read()
                    try:
                        tree = ast.parse(content)
                        for node in ast.walk(tree):
                            if isinstance(node, ast.ClassDef):
                                for item in node.body:
                                    if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                                        field_name = item.target.id
                                        # Check if field annotation contains Optional or None
                                        type_str = ast.unparse(item.annotation) if hasattr(ast, 'unparse') else ""
                                        has_default = item.value is not None
                                        
                                        # If field is common DB optional field like id, email, created_at, phone, details
                                        # and does not have Optional or None default:
                                        if ("Optional" not in type_str and "None" not in type_str and not has_default):
                                            if any(kw in field_name for kw in ["phone", "email", "address", "notes", "description", "document", "reason", "token", "url", "image", "lat", "lng", "rating", "amount", "price", "status"]):
                                                issues.append({
                                                    "file": f,
                                                    "class": node.name,
                                                    "field": field_name,
                                                    "type": type_str,
                                                    "line": item.lineno
                                                })
                    except Exception as e:
                        print(f"Error parsing {f}: {e}")

    print(f"Scanned schema files. Found {len(issues)} potential missing Optional field declarations:\n")
    for issue in issues[:30]:  # Show top results
        print(f"  • {issue['file']}:{issue['line']} -> class {issue['class']}: {issue['field']}: {issue['type']} (Missing Optional/default)")

if __name__ == "__main__":
    scan_pydantic_schemas()
